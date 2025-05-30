import { Hono, Context } from 'hono';
import { Env, ChatRequest, ChatResponse, ChatCompletionResponse, OpenRouterModelsResponse, OpenRouterModel } from '../types';
import { KOREAN_FRIENDLY_MODELS } from '../constants';

const chat = new Hono<{ Bindings: Env }>();

// Simple in-memory cache for models (lasts for worker lifetime)
let modelsCache: { data: any[], timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to format models response
function formatModelsResponse(models: OpenRouterModel[]): string {
  let response = `📋 Available Models (${models.length} total)\n\n`;

  models.forEach((model) => {
    response += `${model.id}\n`;
  });

  response += `\nUsage: /set-model <model-id> or /set-model auto`;
  return response;
}

// Shared function to filter and process models
function filterFreeModels(models: OpenRouterModel[]): OpenRouterModel[] {
  let freeModels = models.filter((m: OpenRouterModel) =>
    m.id.endsWith(':free')
  );

  // Filter out models with 8b or smaller parameter counts
  freeModels = freeModels.filter((m: OpenRouterModel) => {
    const modelId = m.id.toLowerCase();

    // Check for parameter size patterns
    const sizeMatch = modelId.match(/(\d+(?:\.\d+)?)b/);
    if (sizeMatch) {
      const size = parseFloat(sizeMatch[1]);
      return size > 8; // Only keep models larger than 8b
    }

    // Filter out known small models
    if (modelId.includes('mini') || modelId.includes('micro') || modelId.includes('small')) {
      return false;
    }

    // If no size found, keep the model (assume it might be large)
    return true;
  });

  // Sort models by provider priority: meta > google > gemma, then by context size
  return freeModels.sort((a, b) => {
    const aId = a.id.toLowerCase();
    const bId = b.id.toLowerCase();

    // Define provider priority (lower number = higher priority)
    const getProviderPriority = (modelId: string): number => {
      if (modelId.includes('meta') || modelId.includes('llama')) return 1;
      if (modelId.includes('google')) return 2;
      if (modelId.includes('gemma')) return 3;
      return 4; // Other models
    };

    // Get context size from model context_length or estimate from name
    const getContextSize = (model: OpenRouterModel): number => {
      // Try to get from model.context_length if available
      if (model.context_length) return model.context_length;

      // Estimate from model name patterns
      const modelId = model.id.toLowerCase();
      if (modelId.includes('128k')) return 128000;
      if (modelId.includes('32k')) return 32000;
      if (modelId.includes('16k')) return 16000;
      if (modelId.includes('8k')) return 8000;
      if (modelId.includes('4k')) return 4000;

      // Default estimate based on model family
      if (modelId.includes('llama-3.3') || modelId.includes('llama-3.2')) return 128000;
      if (modelId.includes('llama-3.1')) return 128000;
      if (modelId.includes('gemini')) return 32000;
      if (modelId.includes('gemma-2')) return 8000;

      return 4000; // Default
    };

    const aPriority = getProviderPriority(aId);
    const bPriority = getProviderPriority(bId);

    // First sort by provider priority
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then sort by context size (larger first)
    const aContext = getContextSize(a);
    const bContext = getContextSize(b);
    if (aContext !== bContext) {
      return bContext - aContext;
    }

    // Finally sort alphabetically
    return a.id.localeCompare(b.id);
  });
}

// Simple encryption function for login tokens
function encryptPassword(password: string, secret: string): string {
  const combined = password + '|' + Date.now() + '|' + secret;
  return btoa(combined).replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
}

// Simple decryption function for login tokens
function decryptPassword(encrypted: string, secret: string): string | null {
  try {
    const decoded = atob(encrypted.replace(/[-_]/g, (m) => ({'-': '+', '_': '/'}[m] || m)));
    const [password, timestamp, secretCheck] = decoded.split('|');

    // Check if secret matches
    if (secretCheck !== secret) return null;

    // Check if token is not older than 24 hours
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 24 * 60 * 60 * 1000) return null;

    return password;
  } catch {
    return null;
  }
}

// Check if user is authenticated
function checkAuthentication(c: any): boolean {
  const accessPassword = c.env.ACCESS_PASSWORD;
  const encryptionSecret = c.env.OPENROUTER_API_KEY?.slice(0, 16) || 'default-secret-key';

  // Check for password in query, header, or encrypted cookie
  const queryPassword = c.req.query('password');
  const headerPassword = c.req.header('X-Access-Password');
  const encryptedCookie = c.req.header('Cookie')?.includes('auth_token=') ?
    c.req.header('Cookie')?.split('auth_token=')[1]?.split(';')[0] : null;

  let providedPassword = queryPassword || headerPassword;

  // If no direct password, try to decrypt cookie
  if (!providedPassword && encryptedCookie) {
    const decryptedPassword = decryptPassword(encryptedCookie, encryptionSecret);
    if (decryptedPassword) {
      providedPassword = decryptedPassword;
    }
  }

  return providedPassword === accessPassword;
}

// GET /api/auth/status - 인증 상태 확인
chat.get('/auth/status', async (c) => {
  const isAuthenticated = checkAuthentication(c);

  return c.json({
    authenticated: isAuthenticated,
    timestamp: new Date().toISOString()
  });
});

// GET /api/models - 모델 목록 반환
chat.get('/models', async (c) => {
  // Check authentication first
  if (!checkAuthentication(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  const apiKey = c.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'OpenRouter API key not configured' }, 500);
  }

  try {
    // Check cache first
    if (modelsCache && Date.now() - modelsCache.timestamp < CACHE_DURATION) {
      console.log('Using cached models data');
      return c.json({
        success: true,
        models: modelsCache.data,
        cached: true
      });
    }

    const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Cloudflare optimizations
      cf: {
        cacheTtl: 300, // Cache for 5 minutes
        cacheEverything: true
      }
    });

    if (!modelsResponse.ok) {
      return c.json({ error: 'Failed to fetch models' }, 500);
    }

    const modelsData: OpenRouterModelsResponse = await modelsResponse.json();

    // Process and cache models using shared function
    const freeModels = filterFreeModels(modelsData.data);

    // Update cache
    modelsCache = {
      data: freeModels,
      timestamp: Date.now()
    };

    return c.json({
      success: true,
      models: freeModels,
      response: formatModelsResponse(freeModels),
      cached: false
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    return c.json({ error: 'Failed to fetch models' }, 500);
  }
});

// POST /api/set-model - 모델 설정
chat.post('/set-model', async (c) => {
  // Check authentication first
  if (!checkAuthentication(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    const requestBody = await c.req.json();
    const { model } = requestBody;

    if (!model) {
      return c.json({
        success: false,
        error: 'Model name is required'
      }, 400);
    }

    if (model === 'auto') {
      c.header('Set-Cookie', `selected_model=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
      return c.json({
        success: true,
        response: `✅ Model set to auto-select (Korean optimized)`,
        model: 'auto'
      });
    }

    c.header('Set-Cookie', `selected_model=${encodeURIComponent(model)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict`);
    return c.json({
      success: true,
      response: `✅ Model set to: ${model}`,
      model: model
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Invalid request body'
    }, 400);
  }
});

// POST /api/login - 로그인 처리
chat.post('/login', async (c) => {
  try {
    const requestBody = await c.req.json();
    const { password } = requestBody;

    if (!password) {
      return c.json({
        login_failed: true,
        response: `❌ Password is required.\n\nUsage: /login <password>`
      }, 400);
    }

    const accessPassword = c.env.ACCESS_PASSWORD;
    const encryptionSecret = c.env.OPENROUTER_API_KEY?.slice(0, 16) || 'default-secret-key';

    if (password === accessPassword) {
      const encryptedToken = encryptPassword(password, encryptionSecret);
      c.header('Set-Cookie', `auth_token=${encryptedToken}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict`);

      return c.json({
        login_success: true,
        response: `✅ Authentication successful! Welcome to Terminal Chat.\n\n💬 Type your message to start chatting!`
      });
    } else {
      return c.json({
        login_failed: true,
        response: `❌ Authentication failed. Invalid password.\n\nUsage: /login <password>`
      });
    }
  } catch (error) {
    return c.json({
      login_failed: true,
      response: `❌ Invalid request format.\n\nUsage: /login <password>`
    }, 400);
  }
});

// POST /api/chat - 일반 채팅 (명령어 제외)
chat.post('/chat', async (c) => {
  // Check authentication first
  if (!checkAuthentication(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true,
      response: `❌ Authentication required.\n\nUse: /login <password>`
    }, 401);
  }

  try {
    const requestBody: ChatRequest = await c.req.json();
    const { message, model } = requestBody;

    if (!message) {
      return c.json({ error: 'Message is required' }, 400);
    }

    // Regular chat message
    const apiKey = c.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'OpenRouter API key not configured' }, 500);
    }

    // Get selected model from cookie
    const selectedModelCookie = c.req.header('Cookie')?.includes('selected_model=') ?
      decodeURIComponent(c.req.header('Cookie')?.split('selected_model=')[1]?.split(';')[0] || '') : null;

    let selectedModel = selectedModelCookie || model || 'meta-llama/llama-3.1-8b-instruct:free';

    // Auto-select if no specific model
    if (!selectedModelCookie && !model) {
      try {
        // Check cache first for auto-selection
        let freeModels: OpenRouterModel[] = [];

        if (modelsCache && Date.now() - modelsCache.timestamp < CACHE_DURATION) {
          console.log('Using cached models for auto-selection');
          freeModels = modelsCache.data;
        } else {
          // Fetch fresh models if cache is stale
          const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (modelsResponse.ok) {
            const modelsData: OpenRouterModelsResponse = await modelsResponse.json();
            freeModels = filterFreeModels(modelsData.data);

            // Update cache
            modelsCache = {
              data: freeModels,
              timestamp: Date.now()
            };
          }
        }

        if (freeModels.length > 0) {
          // Use the same priority system as filterFreeModels
          // Models are already sorted by priority: meta > google > gemma, then by context size
          selectedModel = freeModels[0].id;
        }
      } catch (error) {
        console.warn('Auto-selection failed:', error);
      }
    }

    // Optimized chat request with streaming support
    const chatResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://chat.h4o.kim',
        'X-Title': 'Terminal Chat',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: 'user', content: message }],
        max_tokens: 1000,
        temperature: 0.7,
        stream: false // Keep false for now, but optimized for speed
      }),
      // Cloudflare-specific optimizations
      cf: {
        cacheTtl: 0, // Don't cache chat responses
        cacheEverything: false
      }
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      return c.json({
        error: `Chat API error: ${chatResponse.status}`,
        details: errorText
      }, 500);
    }

    const chatData: ChatCompletionResponse = await chatResponse.json();

    if (!chatData.choices?.[0]?.message) {
      return c.json({ error: 'Invalid response structure' }, 500);
    }

    // Optimized response with compression hints
    const response = c.json({
      response: chatData.choices[0].message.content || '',
      model: selectedModel,
    });

    // Add compression headers
    response.headers.set('Content-Encoding', 'gzip');
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    return response;

  } catch (error) {
    console.error('Chat error:', error);
    return c.json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default chat;
