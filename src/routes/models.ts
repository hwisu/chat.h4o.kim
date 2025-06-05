import { Hono } from 'hono';
import { Env, OpenRouterModelsResponse, OpenRouterModel } from '../types';
import { checkAuthenticationOrUserKey } from './auth';

const models = new Hono<{ Bindings: Env }>();

// Simple in-memory cache for models (lasts for worker lifetime)
let modelsCache: { data: any[], timestamp: number, type?: string } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Common utility functions
function getProviderPriority(modelId: string, isUserApiKey: boolean = false): number {
  if (isUserApiKey) {
    // Priority for user API key (premium models first)
    if (modelId.includes('claude')) return 1;
    if (modelId.includes('gpt-4')) return 2;
    if (modelId.includes('meta') || modelId.includes('llama')) return 3;
    if (modelId.includes('google')) return 4;
    if (modelId.includes('deepseek')) return 5;
    if (modelId.includes('gemma')) return 6;
    return 7; // Other models
  } else {
    // Priority for free models
    if (modelId.includes('meta') || modelId.includes('llama')) return 1;
    if (modelId.includes('google')) return 2;
    if (modelId.includes('deepseek')) return 3;
    if (modelId.includes('gemma')) return 4;
    return 5; // Other models
  }
}

function getContextSize(model: OpenRouterModel): number {
  // Always use the actual context_length from OpenRouter API if available
  if (model.context_length && model.context_length > 0) {
    return model.context_length;
  }

  // Log when fallback estimation is used
  console.warn(`⚠️ Using context size estimation for model: ${model.id} (no context_length in API response)`);

  // Fallback: Estimate from model name patterns only when API doesn't provide context_length
  const modelId = model.id.toLowerCase();
  if (modelId.includes('128k')) return 128000;
  if (modelId.includes('32k')) return 32000;
  if (modelId.includes('16k')) return 16000;
  if (modelId.includes('8k')) return 8000;
  if (modelId.includes('4k')) return 4000;

  // Default estimate based on model family
  if (modelId.includes('llama-3.3') || modelId.includes('llama-3.2')) return 128000;
  if (modelId.includes('llama-3.1')) return 128000;
  if (modelId.includes('deepseek')) return 32000;
  if (modelId.includes('gemini')) return 32000;
  if (modelId.includes('gemma-2')) return 8000;

  // Conservative default
  return 4000;
}

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
export function filterFreeModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return models
    .filter((m: OpenRouterModel) =>
      // 무료 모델만 선택
      m.id.endsWith(':free') &&
      // 작은 모델 제외 (mini, micro, small 키워드 포함)
      !m.id.toLowerCase().match(/mini|micro|small/) &&
      // 8B 이상 모델만 선택 (또는 크기를 알 수 없는 모델)
      (!m.id.toLowerCase().match(/(\d+(?:\.\d+)?)b/) ||
        parseFloat(m.id.toLowerCase().match(/(\d+(?:\.\d+)?)b/)?.[1] || '8') >= 8)
    )
    .sort((a, b) => {
      const aId = a.id.toLowerCase();
      const bId = b.id.toLowerCase();

      // 공급자 우선순위로 정렬
      const aPriority = getProviderPriority(aId, false);
      const bPriority = getProviderPriority(bId, false);

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // 컨텍스트 크기로 정렬 (큰 것 우선)
      const aContext = getContextSize(a);
      const bContext = getContextSize(b);

      if (aContext !== bContext) {
        return bContext - aContext;
      }

      // 알파벳 순
      return a.id.localeCompare(b.id);
    });
}

// Helper function to get API key (user key takes priority) - export for use in other modules
export function getApiKey(c: any): string {
  const userApiKey = c.req.header('X-User-API-Key');
  const serverApiKey = c.env.OPENROUTER_API_KEY;

  if (userApiKey && userApiKey.startsWith('sk-or-v1-')) {
    // console.log('Using user-provided API key');
    return userApiKey;
  }

  if (serverApiKey) {
    // console.log('Using server API key');
    return serverApiKey;
  }

  throw new Error('No valid API key available');
}

// Helper function to get selected model from cookie
export function getSelectedModelFromCookie(c: any): string | null {
  const cookies = c.req.header('Cookie');
  if (!cookies?.includes('selected_model=')) {
    return null;
  }

  return decodeURIComponent(cookies.split('selected_model=')[1]?.split(';')[0] || '');
}

// Auto-select best available model
export async function autoSelectModel(c: any, apiKey: string, skipLog?: boolean): Promise<string> {
  try {
    // Check cache first for auto-selection
    let freeModels: OpenRouterModel[] = [];

    if (modelsCache && Date.now() - modelsCache.timestamp < CACHE_DURATION) {
      freeModels = modelsCache.data;
    } else {
      // 캐시 타임아웃 설정으로 빠른 응답 보장
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3초 타임아웃

      try {
        const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          cf: {
            cacheTtl: 300,
            cacheEverything: true
          }
        });

        clearTimeout(timeoutId);

        if (modelsResponse.ok) {
          const modelsData: OpenRouterModelsResponse = await modelsResponse.json();
          freeModels = filterFreeModels(modelsData.data);

          // Update cache
          modelsCache = {
            data: freeModels,
            timestamp: Date.now(),
            type: 'server' // 기본 서버 타입으로 설정
          };
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.warn('Models fetch failed:', error);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (freeModels.length > 0) {
      // Models are already sorted by priority
      const selectedModel = freeModels[0].id;
      if (!skipLog) {
        console.log(`🎯 Auto-selected model: ${selectedModel}`);
      }
      return selectedModel;
    }
  } catch (error) {
    console.warn('Auto-selection failed:', error);
  }

  // Fallback
  return 'meta-llama/llama-3.1-8b-instruct:free';
}

// Get selected model with auto-selection support
export async function getSelectedModel(c: any, requestedModel?: string, skipLog?: boolean): Promise<string> {
  const apiKey = getApiKey(c);
  const selectedModelCookie = getSelectedModelFromCookie(c);

  let selectedModel = selectedModelCookie || requestedModel || 'meta-llama/llama-3.1-8b-instruct:free';

  // Auto-select if model is 'auto' or no specific model set
  if (selectedModel === 'auto' || (!selectedModelCookie && !requestedModel)) {
    selectedModel = await autoSelectModel(c, apiKey, skipLog);
  }

  return selectedModel;
}

// GET /api/models - 모델 목록 반환
models.get('/models', async (c) => {
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
      return c.json({
        success: true,
        models: modelsCache.data,
        cached: true,
        user_api_key: hasUserApiKey
      });
    }

    // 타임아웃 설정으로 빠른 응답 보장
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3초 타임아웃

    try {
      const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        cf: {
          cacheTtl: 300,
          cacheEverything: true
        }
      });

      clearTimeout(timeoutId);

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

          const aPriority = getProviderPriority(aId, true);
          const bPriority = getProviderPriority(bId, true);

          // First sort by provider priority
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }

          // Then sort by context size (larger first)
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

      // Debug: Log context_length info for first few models
      if (processedModels.length > 0) {
        console.log(`📊 Models context info (first 3 models):`);
        processedModels.slice(0, 3).forEach(model => {
          console.log(`  ${model.id}: ${model.context_length || 'N/A'} tokens`);
        });
      }

      return c.json({
        success: true,
        models: processedModels,
        response: formatModelsResponse(processedModels),
        cached: false,
        user_api_key: hasUserApiKey
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // 타임아웃 발생 시 캐시된 데이터 있으면 사용
        if (modelsCache) {
          return c.json({
            success: true,
            models: modelsCache.data,
            response: formatModelsResponse(modelsCache.data),
            cached: true,
            user_api_key: hasUserApiKey
          });
        }
      }

      throw error; // 다른 에러는 아래에서 처리
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('Error fetching models:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to fetch models'
    }, 500);
  }
});

// POST /api/set-model - 모델 설정
models.post('/set-model', async (c) => {
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

export default models;
