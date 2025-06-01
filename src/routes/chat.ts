import { Hono, Context } from 'hono';
import { Env, ChatRequest, ChatResponse, ChatCompletionResponse, OpenRouterModelsResponse, OpenRouterModel } from '../types';
import { KOREAN_FRIENDLY_MODELS } from '../constants';

const chat = new Hono<{ Bindings: Env }>();

// Simple in-memory cache for models (lasts for worker lifetime)
let modelsCache: { data: any[], timestamp: number, type?: string } | null = null;
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

  console.log(`\n=== DEBUG: All Free Models (${freeModels.length}) ===`);
  freeModels.forEach((model, index) => {
    console.log(`${index + 1}. ${model.id}`);
  });

  // Filter out models with smaller than 8b parameter counts (keep 8b and larger)
  freeModels = freeModels.filter((m: OpenRouterModel) => {
    const modelId = m.id.toLowerCase();

    // Check for parameter size patterns
    const sizeMatch = modelId.match(/(\d+(?:\.\d+)?)b/);
    if (sizeMatch) {
      const size = parseFloat(sizeMatch[1]);
      const keep = size >= 8; // Keep models 8b and larger (changed from > 8)
      console.log(`Size check - ${m.id}: ${size}b -> ${keep ? 'KEEP' : 'FILTER'}`);
      return keep;
    }

    // Filter out known small models
    if (modelId.includes('mini') || modelId.includes('micro') || modelId.includes('small')) {
      console.log(`Small model check - ${m.id}: FILTER (contains mini/micro/small)`);
      return false;
    }

    // If no size found, keep the model (assume it might be large)
    console.log(`No size found - ${m.id}: KEEP (assume large)`);
    return true;
  });

  console.log(`\n=== DEBUG: Filtered Models (${freeModels.length}) ===`);
  freeModels.forEach((model, index) => {
    console.log(`${index + 1}. ${model.id}`);
  });

  // Sort models by provider priority: meta > google > deepseek > gemma, then by context size
  return freeModels.sort((a, b) => {
    const aId = a.id.toLowerCase();
    const bId = b.id.toLowerCase();

    // Define provider priority (lower number = higher priority)
    const getProviderPriority = (modelId: string): number => {
      if (modelId.includes('meta') || modelId.includes('llama')) return 1;
      if (modelId.includes('google')) return 2;
      if (modelId.includes('deepseek')) return 3; // Added deepseek priority
      if (modelId.includes('gemma')) return 4;
      return 5; // Other models
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
      if (modelId.includes('deepseek')) return 32000; // Added deepseek default
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

// Advanced encryption function for login tokens using HMAC-SHA256
async function encryptPassword(password: string, secret: string): Promise<string> {
  // Generate cryptographically secure random values
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const nonce = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  
  // High-precision timestamp with additional entropy
  const timestamp = Date.now() + Math.random() * 1000;
  const entropy = Math.random().toString(36).substring(2, 15);
  
  // Create header and payload (JWT-like structure)
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    pwd: password,
    iat: timestamp,
    exp: timestamp + (24 * 60 * 60 * 1000), // 24 hours
    nonce: nonce,
    entropy: entropy,
    iss: "chatty-h4o"
  };
  
  // Base64url encode header and payload
  const encodedHeader = btoa(JSON.stringify(header)).replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  
  // Create message to sign
  const message = `${encodedHeader}.${encodedPayload}`;
  
  // Create HMAC-SHA256 signature using Web Crypto API
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret + nonce.slice(0, 16)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );
  
  // Convert signature to base64url
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
    .replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  
  // Return JWT-like token
  return `${message}.${signatureBase64}`;
}

// Advanced decryption function for login tokens
async function decryptPassword(encrypted: string, secret: string): Promise<string | null> {
  try {
    const parts = encrypted.split('.');
    if (parts.length !== 3) {
      // Try legacy format fallback
      return decryptLegacyPassword(encrypted, secret);
    }
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Decode header and payload
    const header = JSON.parse(atob(encodedHeader.replace(/[-_]/g, (m) => ({'-': '+', '_': '/'}[m] || m))));
    const payload = JSON.parse(atob(encodedPayload.replace(/[-_]/g, (m) => ({'-': '+', '_': '/'}[m] || m))));
    
    // Verify algorithm
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }
    
    // Check expiration
    if (Date.now() > payload.exp) {
      return null;
    }
    
    // Verify issuer
    if (payload.iss !== "chatty-h4o") {
      return null;
    }
    
    // Recreate the signing key using nonce from payload
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret + payload.nonce.slice(0, 16)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    // Verify signature
    const message = `${encodedHeader}.${encodedPayload}`;
    const signatureBytes = Uint8Array.from(
      atob(signature.replace(/[-_]/g, (m) => ({'-': '+', '_': '/'}[m] || m))), 
      c => c.charCodeAt(0)
    );
    
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes.buffer,
      new TextEncoder().encode(message)
    );
    
    if (!isValid) {
      return null;
    }
    
    return payload.pwd;
  } catch (error) {
    console.warn('Token verification failed:', error);
    return null;
  }
}

// Legacy format support for backward compatibility
function decryptLegacyPassword(encrypted: string, secret: string): string | null {
  try {
    // Restore standard base64 characters
    const restored = encrypted.replace(/[-_]/g, (m) => ({'-': '+', '_': '/'}[m] || m));
    
    // First decode to get the double-encoded content
    const firstDecoded = atob(restored);
    
    // Check if this is a new format (double-encoded) token
    if (firstDecoded.includes('|')) {
      const parts = firstDecoded.split('|');
      if (parts.length >= 2) {
        // New format: decode the first part
        const secondDecoded = atob(parts[0]);
        const [password, timestamp, secretCheck, entropy] = secondDecoded.split('|');

        // Check if secret matches
        if (secretCheck !== secret) return null;

        // Check if token is not older than 24 hours
        const tokenTimestamp = parseFloat(timestamp.toString().split('.')[0] || timestamp.toString());
        const tokenAge = Date.now() - tokenTimestamp;
        if (tokenAge > 24 * 60 * 60 * 1000) return null;

        return password;
      }
    }

    // Fallback for old format tokens
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

// Check if user is authenticated OR has valid user API key
async function checkAuthenticationOrUserKey(c: any): Promise<boolean> {
  const userApiKey = c.req.header('X-User-API-Key');
  
  // If user has provided their own API key, allow access without server authentication
  if (userApiKey && userApiKey.startsWith('sk-or-v1-')) {
    console.log('Access granted with user API key');
    return true;
  }
  
  // Otherwise, check server authentication
  const accessPassword = c.env.ACCESS_PASSWORD
  const encryptionSecret = c.env.OPENROUTER_API_KEY?.slice(0, 16) || 'default-secret-key';

  // Check for password in query, header, or encrypted cookie
  const queryPassword = c.req.query('password');
  const headerPassword = c.req.header('X-Access-Password');
  
  // Improved cookie parsing
  let encryptedCookie = null;
  const cookieHeader = c.req.header('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'auth_token' && value) {
        encryptedCookie = value;
        break;
      }
    }
  }

  let providedPassword = queryPassword || headerPassword;

  // If no direct password, try to decrypt cookie
  if (!providedPassword && encryptedCookie) {
    try {
      const decryptedPassword = await decryptPassword(encryptedCookie, encryptionSecret);
      if (decryptedPassword) {
        providedPassword = decryptedPassword;
      }
    } catch (error) {
      console.warn('Failed to decrypt auth token:', error);
    }
  }

  const isAuthenticated = providedPassword === accessPassword;
  
  // Log authentication attempts for debugging (remove in production)
  console.log('Auth check:', {
    hasQuery: !!queryPassword,
    hasHeader: !!headerPassword,
    hasCookie: !!encryptedCookie,
    hasUserKey: !!userApiKey,
    authenticated: isAuthenticated
  });

  return isAuthenticated;
}

// Helper function to get API key (user key takes priority)
function getApiKey(c: any): string {
  const userApiKey = c.req.header('X-User-API-Key');
  const serverApiKey = c.env.OPENROUTER_API_KEY;
  
  if (userApiKey && userApiKey.startsWith('sk-or-v1-')) {
    console.log('Using user-provided API key');
    return userApiKey;
  }
  
  if (serverApiKey) {
    console.log('Using server API key');
    return serverApiKey;
  }
  
  throw new Error('No valid API key available');
}

// GET /api/models - 모델 목록 반환
chat.get('/models', async (c) => {
  // Check authentication first
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    const apiKey = getApiKey(c);
    const hasUserApiKey = c.req.header('X-User-API-Key') !== undefined;
    
    // Check cache first - separate cache for user vs server keys
    const cacheKey = hasUserApiKey ? 'user' : 'server';
    if (modelsCache && modelsCache.type === cacheKey && Date.now() - modelsCache.timestamp < CACHE_DURATION) {
      console.log(`Using cached models data for ${cacheKey}`);
      return c.json({
        success: true,
        models: modelsCache.data,
        cached: true,
        user_api_key: hasUserApiKey
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
      if (modelsResponse.status === 401) {
        return c.json({ 
          error: 'Invalid API key. Please check your OpenRouter API key.',
          auth_required: true 
        }, 401);
      }
      return c.json({ error: 'Failed to fetch models' }, 500);
    }

    const modelsData: OpenRouterModelsResponse = await modelsResponse.json();

    // Process models - if user has their own API key, show all models
    // If using server key, only show free models
    let processedModels: OpenRouterModel[];
    if (hasUserApiKey) {
      // User API key: show all models, sorted by priority
      processedModels = modelsData.data.sort((a, b) => {
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();

        // Define provider priority for user API key (lower number = higher priority)
        const getProviderPriority = (modelId: string): number => {
          if (modelId.includes('claude')) return 1;
          if (modelId.includes('gpt-4')) return 2;
          if (modelId.includes('meta') || modelId.includes('llama')) return 3;
          if (modelId.includes('google')) return 4;
          if (modelId.includes('deepseek')) return 5;
          if (modelId.includes('gemma')) return 6;
          return 7; // Other models
        };

        const aPriority = getProviderPriority(aId);
        const bPriority = getProviderPriority(bId);

        // First sort by provider priority
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Then sort by context size (larger first)
        const getContextSize = (model: OpenRouterModel): number => {
          if (model.context_length) return model.context_length;
          
          const modelId = model.id.toLowerCase();
          if (modelId.includes('128k')) return 128000;
          if (modelId.includes('32k')) return 32000;
          if (modelId.includes('16k')) return 16000;
          if (modelId.includes('8k')) return 8000;
          if (modelId.includes('4k')) return 4000;

          return 8000; // Default
        };

        const aContext = getContextSize(a);
        const bContext = getContextSize(b);
        return bContext - aContext;
      });
    } else {
      // Server API key: only free models
      processedModels = filterFreeModels(modelsData.data);
    }

    // Update cache with type info
    modelsCache = {
      data: processedModels,
      timestamp: Date.now(),
      type: cacheKey
    };

    return c.json({
      success: true,
      models: processedModels,
      response: formatModelsResponse(processedModels),
      cached: false,
      user_api_key: hasUserApiKey
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch models' 
    }, 500);
  }
});

// POST /api/set-model - 모델 설정
chat.post('/set-model', async (c) => {
  // Check authentication first
  if (!await checkAuthenticationOrUserKey(c)) {
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

    const accessPassword = c.env.ACCESS_PASSWORD
    const encryptionSecret = c.env.OPENROUTER_API_KEY?.slice(0, 16) || 'default-secret-key';

    if (password === accessPassword) {
      const encryptedToken = await encryptPassword(password, encryptionSecret);
      c.header('Set-Cookie', `auth_token=${encryptedToken}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict`);

      return c.json({
        login_success: true,
        response: `✅ Server authentication successful! Welcome to Chatty.\n\n📡 You're now using the server's API key for free access.\n\n🔑 API Key Options:\n• Continue with server key (current)\n• Switch to personal key: /set-api-key <your-key>\n• Check status: /api-key-status\n\nCommands:\n  /models - List available models\n  /set-model <model-id> - Set current model\n  /clear - Clear conversation history\n  /help - Show all commands\n\n💬 Type your message to start chatting!\n\n🧠 Enhanced Features:\n• Conversation context maintained\n• Optimized AI parameters\n• Better response quality`
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

// GET /api/help - 도움말 반환
chat.get('/help', async (c) => {
  return c.json({
    success: true,
    response: `📖 Chatty Commands:\n\n🔐 Authentication:\n/login <password>          - Authenticate with server\n\n🔑 API Key Management:\n/set-api-key <key>         - Set your personal OpenRouter API key\n/remove-api-key            - Remove personal API key (use server key)\n/api-key-status            - Check current API key status\n\n🤖 Model Commands:\n/models                    - List available AI models\n/set-model <id>            - Set specific model\n/set-model auto            - Use auto-selection\n\n💬 Chat Commands:\n/clear                     - Clear conversation history\n/help                      - Show this help\n\n💡 Features:\n• Personal API key support (stored locally & encrypted)\n• Conversation context maintained across messages\n• Optimized parameters for better responses\n• Smart token management\n\n🌐 Get your API key: https://openrouter.ai/settings/keys`
  });
});

// GET /api/auth/verify - 인증 상태 확인
chat.get('/auth/verify', async (c) => {
  const userApiKey = c.req.header('X-User-API-Key');
  const hasUserKey = userApiKey && userApiKey.startsWith('sk-or-v1-');
  
  if (hasUserKey) {
    return c.json({
      authenticated: true,
      auth_method: 'user_api_key',
      auth_type: 'Personal API Key'
    });
  }

  const isServerAuth = await checkAuthenticationOrUserKey(c);
  
  if (isServerAuth) {
    return c.json({
      authenticated: true,
      auth_method: 'server_password',
      auth_type: 'Server Password'
    });
  }

  return c.json({
    authenticated: false,
    auth_method: null,
    auth_type: null
  });
});

// POST /api/chat - 일반 채팅 (명령어 제외)
chat.post('/chat', async (c) => {
  // Check authentication first
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true,
      response: `❌ Authentication required.\n\nUse: /login <password>`
    }, 401);
  }

  try {
    const requestBody: any = await c.req.json();
    
    // Handle compressed data - support LZ-String and fallback compression
    let decompressedData = requestBody;
    
    if (requestBody.compressed && requestBody.compression_method === 'lz-string') {
      // Handle LZ-String compressed data
      try {
        console.log('Decompressing LZ-String data...');
        // For simplicity, let client handle LZ-String compression/decompression
        // Server will work with the compressed payload as-is for now
        // In production, you might want to decompress server-side
        console.log('LZ-String compression detected, using fallback decompression');
        decompressedData = {
          message: requestBody.m || requestBody.message,
          conversationHistory: requestBody.h || requestBody.conversationHistory || []
        };
      } catch (error) {
        console.warn('LZ-String decompression failed:', error);
        decompressedData = requestBody;
      }
    } else if (requestBody.c) {
      // Handle fallback compression (field name shortening)
      interface CompressedMessage {
        r: string;
        c: string;
        t: number;
      }
      
      decompressedData = {
        message: requestBody.m,
        conversationHistory: (requestBody.h || []).map((msg: CompressedMessage) => ({
          role: msg.r,
          content: msg.c,
          timestamp: msg.t
        }))
      };
    }
    
    const { 
      message, 
      model, 
      conversationHistory = [],
      temperature = 0.7,
      max_tokens = 1500,
      top_p = 0.9,
      frequency_penalty = 0.1,
      presence_penalty = 0.1
    } = decompressedData;

    if (!message) {
      return c.json({ error: 'Message is required' }, 400);
    }

    // Regular chat message
    try {
      const apiKey = getApiKey(c);
      
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

      // Prepare messages with conversation context
      const messages = [];
      
      // Add conversation history
      if (conversationHistory && conversationHistory.length > 0) {
        conversationHistory.forEach(msg => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role,
              content: msg.content
            });
          }
        });
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: message
      });

      // Optimized chat request with enhanced parameters
      const chatResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://chat.h4o.kim',
          'X-Title': 'Chatty',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: messages,
          max_tokens: max_tokens,
          temperature: temperature,
          top_p: top_p,
          frequency_penalty: frequency_penalty,
          presence_penalty: presence_penalty,
          stream: false // Future: could implement streaming
        }),
        // Cloudflare-specific optimizations
        cf: {
          cacheTtl: 0, // Don't cache chat responses
          cacheEverything: false
        }
      });

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        
        if (chatResponse.status === 401) {
          return c.json({
            error: 'Invalid API key. Please check your OpenRouter API key.',
            details: errorText,
            auth_required: true
          }, 401);
        }
        
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

    } catch (apiError) {
      console.error('API error:', apiError);
      return c.json({
        error: apiError instanceof Error ? apiError.message : 'API configuration error',
        details: 'Please check your API key configuration'
      }, 500);
    }

  } catch (error) {
    console.error('Chat error:', error);
    return c.json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default chat;
