import { Hono } from 'hono';
import { Env, OpenRouterModelsResponse, OpenRouterModel, ModelInfo } from '../types';
import { authRequired } from '../middleware/auth';
import { RESPONSE_MESSAGES, API_CONFIG, MODEL_CONFIG, HTTP_STATUS } from './constants';
import { successResponse, errorResponse, asyncHandler, parseJsonBody, getCookieValue, setCookie, fetchWithTimeout } from './utils';

const models = new Hono<{ Bindings: Env }>();

// Model cache with type information
interface ModelCache {
  data: ModelInfo[];
  timestamp: number;
  type: 'user' | 'server';
}

let modelsCache: ModelCache | null = null;

// Transform OpenRouterModel to ModelInfo format
function transformToModelInfo(openRouterModel: OpenRouterModel, isSelected: boolean = false): ModelInfo {
  // Extract provider from model name or id
  let provider = 'Unknown';
  if (openRouterModel.name.includes(':')) {
    provider = openRouterModel.name.split(':')[0];
  } else if (openRouterModel.id.includes('/')) {
    provider = openRouterModel.id.split('/')[0];
  }

  // Clean model name - remove (free) tags and :free suffixes
  let cleanName = openRouterModel.name;
  cleanName = cleanName.replace(/\s*\(free\)\s*$/i, '');
  cleanName = cleanName.replace(/:free\s*$/i, '');

  return {
    id: openRouterModel.id,
    name: cleanName,
    provider,
    context_length: openRouterModel.context_length,
    selected: isSelected
  };
}

// Transform array of OpenRouterModels to ModelInfos
function transformModelsArray(openRouterModels: OpenRouterModel[], selectedModelId?: string): ModelInfo[] {
  return openRouterModels.map(model => 
    transformToModelInfo(model, model.id === selectedModelId)
  );
}

// Utility Functions
function getProviderPriority(modelId: string, isUserApiKey: boolean = false): number {
  const lowerModelId = modelId.toLowerCase();
  
  if (isUserApiKey) {
    // Premium models priority for user API keys
    if (lowerModelId.includes('claude')) return 1;
    if (lowerModelId.includes('gpt-4')) return 2;
    if (lowerModelId.includes('meta') || lowerModelId.includes('llama')) return 3;
    if (lowerModelId.includes('google')) return 4;
    if (lowerModelId.includes('deepseek')) return 5;
    if (lowerModelId.includes('gemma')) return 6;
    return 7;
  } else {
    // Free models priority
    if (lowerModelId.includes('meta') || lowerModelId.includes('llama')) return 1;
    if (lowerModelId.includes('google')) return 2;
    if (lowerModelId.includes('deepseek')) return 3;
    if (lowerModelId.includes('gemma')) return 4;
    return 5;
  }
}

function getContextSize(model: OpenRouterModel): number {
  if (model.context_length && model.context_length > 0) {
    return model.context_length;
  }

  console.warn(`⚠️ Using context size estimation for model: ${model.id}`);

  const modelId = model.id.toLowerCase();
  
  // Pattern-based estimation
  if (modelId.includes('128k')) return 128000;
  if (modelId.includes('32k')) return 32000;
  if (modelId.includes('16k')) return 16000;
  if (modelId.includes('8k')) return 8000;
  if (modelId.includes('4k')) return 4000;

  // Model family estimation
  if (modelId.includes('llama-3.3') || modelId.includes('llama-3.2') || modelId.includes('llama-3.1')) return 128000;
  if (modelId.includes('deepseek') || modelId.includes('gemini')) return 32000;
  if (modelId.includes('gemma-2')) return 8000;

  return 4000; // Conservative default
}

function formatModelsResponse(models: OpenRouterModel[]): string {
  let response = `📋 Available Models (${models.length} total)\n\n`;
  models.forEach(model => response += `${model.id}\n`);
  response += `\nUsage: /set-model <model-id> or /set-model auto`;
  return response;
}

// Filter free models with quality criteria
export function filterFreeModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return models
    .filter((m: OpenRouterModel) =>
      m.id.endsWith(':free') &&
      !m.id.toLowerCase().match(/mini|micro|small/) &&
      (!m.id.toLowerCase().match(/(\d+(?:\.\d+)?)b/) ||
        parseFloat(m.id.toLowerCase().match(/(\d+(?:\.\d+)?)b/)?.[1] || '8') >= 8)
    )
    .sort((a, b) => {
      const aPriority = getProviderPriority(a.id, false);
      const bPriority = getProviderPriority(b.id, false);

      if (aPriority !== bPriority) return aPriority - bPriority;

      const aContext = getContextSize(a);
      const bContext = getContextSize(b);
      if (aContext !== bContext) return bContext - aContext;

      return a.id.localeCompare(b.id);
    });
}

// Get API key (user key takes priority)
export function getApiKey(c: any): string {
  const userApiKey = c.req.header('X-User-API-Key');
  const serverApiKey = c.env.OPENROUTER_API_KEY;

  if (userApiKey?.startsWith(MODEL_CONFIG.API_KEY_PREFIX)) {
    return userApiKey;
  }

  if (serverApiKey) {
    return serverApiKey;
  }

  throw new Error('No valid API key available');
}

// Get selected model from cookie
export function getSelectedModelFromCookie(c: any): string | null {
  return getCookieValue(c, 'selected_model');
}

// Auto-select best available model
export async function autoSelectModel(c: any, apiKey: string, skipLog?: boolean): Promise<string> {
  try {
    let freeModels: OpenRouterModel[] = [];

    // Check cache first - need to handle different cache format
    if (modelsCache && Date.now() - modelsCache.timestamp < API_CONFIG.CACHE_DURATION) {
      // Convert cached ModelInfo back to OpenRouterModel for processing
      freeModels = []; // We'll use the cached data differently
    } else {
      // Fetch with timeout
      try {
        const modelsResponse = await fetchWithTimeout(`${API_CONFIG.OPENROUTER_BASE_URL}/models`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: API_CONFIG.REQUEST_TIMEOUT,
          cf: { cacheTtl: 300, cacheEverything: true }
        });

        if (modelsResponse.ok) {
          const modelsData: OpenRouterModelsResponse = await modelsResponse.json();
          freeModels = filterFreeModels(modelsData.data);

          modelsCache = {
            data: transformModelsArray(freeModels),
            timestamp: Date.now(),
            type: 'server'
          };
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.warn('Models fetch failed:', error);
        }
      }
    }

    // Use cached data if available and no fresh data
    if (freeModels.length === 0 && modelsCache?.data && modelsCache.data.length > 0) {
      const selectedModel = modelsCache.data[0].id;
      if (!skipLog) {
        console.log(`🎯 Auto-selected model from cache: ${selectedModel}`);
      }
      return selectedModel;
    }

    if (freeModels.length > 0) {
      const selectedModel = freeModels[0].id;
      if (!skipLog) {
        console.log(`🎯 Auto-selected model: ${selectedModel}`);
      }
      return selectedModel;
    }
  } catch (error) {
    console.warn('Auto-selection failed:', error);
  }

  return MODEL_CONFIG.DEFAULT_MODEL;
}

// Get selected model with auto-selection support
export async function getSelectedModel(c: any, requestedModel?: string, skipLog?: boolean): Promise<string> {
  const apiKey = getApiKey(c);
  const selectedModelCookie = getSelectedModelFromCookie(c);

  let selectedModel = selectedModelCookie || requestedModel || MODEL_CONFIG.DEFAULT_MODEL;

  if (selectedModel === MODEL_CONFIG.AUTO_SELECT || (!selectedModelCookie && !requestedModel)) {
    selectedModel = await autoSelectModel(c, apiKey, skipLog);
  }

  return selectedModel;
}

// Fetch and process models from API
async function fetchModels(apiKey: string, hasUserApiKey: boolean): Promise<OpenRouterModel[]> {
  const modelsResponse = await fetchWithTimeout(`${API_CONFIG.OPENROUTER_BASE_URL}/models`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: API_CONFIG.REQUEST_TIMEOUT,
    cf: { cacheTtl: 300, cacheEverything: true }
  });

  if (!modelsResponse.ok) {
    if (modelsResponse.status === HTTP_STATUS.UNAUTHORIZED) {
      throw new Error(RESPONSE_MESSAGES.INVALID_API_KEY);
    }
    throw new Error(RESPONSE_MESSAGES.MODELS_FETCH_FAILED);
  }

  const modelsData: OpenRouterModelsResponse = await modelsResponse.json();

  // Process models based on API key type
  if (hasUserApiKey) {
    // User API key: show all models, sorted by priority
    return modelsData.data.sort((a, b) => {
      const aPriority = getProviderPriority(a.id, true);
      const bPriority = getProviderPriority(b.id, true);

      if (aPriority !== bPriority) return aPriority - bPriority;

      const aContext = getContextSize(a);
      const bContext = getContextSize(b);
      return bContext - aContext;
    });
  } else {
    // Server API key: only free models
    return filterFreeModels(modelsData.data);
  }
}

// Routes
models.get('/models', authRequired, asyncHandler(async (c) => {
  const apiKey = getApiKey(c);
  const hasUserApiKey = c.req.header('X-User-API-Key') !== undefined;
  const cacheKey = hasUserApiKey ? 'user' : 'server';
  const selectedModelCookie = getSelectedModelFromCookie(c);

  // Check cache first
  if (modelsCache?.type === cacheKey && Date.now() - modelsCache.timestamp < API_CONFIG.CACHE_DURATION) {
    return successResponse(c, {
      models: modelsCache.data,
      cached: true,
      user_api_key: hasUserApiKey
    });
  }

  try {
    const processedModels = await fetchModels(apiKey, hasUserApiKey);
    
    // Transform to ModelInfo format with selected status
    const modelInfos = transformModelsArray(processedModels, selectedModelCookie || undefined);

    // Update cache
    modelsCache = {
      data: modelInfos,
      timestamp: Date.now(),
      type: cacheKey
    };

    // Debug info for first few models
    if (processedModels.length > 0) {
      console.log(`📊 Models context info (first 3):`);
      processedModels.slice(0, 3).forEach(model => {
        console.log(`  ${model.id}: ${model.context_length || 'N/A'} tokens`);
      });
    }

    return successResponse(c, {
      models: modelInfos,
      response: formatModelsResponse(processedModels),
      cached: false,
      user_api_key: hasUserApiKey
    });
  } catch (error: any) {
    if (error.name === 'AbortError' && modelsCache) {
      // Return cached data on timeout
      return successResponse(c, {
        models: modelsCache.data,
        response: formatModelsResponse([]), // We don't have OpenRouterModel format in cache
        cached: true,
        user_api_key: hasUserApiKey
      });
    }

    // Handle authentication errors with proper status
    if (error.message === RESPONSE_MESSAGES.INVALID_API_KEY) {
      return errorResponse(c, error.message, HTTP_STATUS.UNAUTHORIZED, { auth_required: true });
    }

    throw error;
  }
}));

models.post('/set-model', authRequired, asyncHandler(async (c) => {
  const { model } = await parseJsonBody<{ model: string }>(c, ['model']);

  if (model === MODEL_CONFIG.AUTO_SELECT) {
    setCookie(c, 'selected_model', '', 0); // Clear cookie
    return successResponse(c, {
      response: RESPONSE_MESSAGES.MODEL_AUTO_SET_SUCCESS,
      model: MODEL_CONFIG.AUTO_SELECT
    }, RESPONSE_MESSAGES.MODEL_AUTO_SET_SUCCESS);
  }

  setCookie(c, 'selected_model', model, API_CONFIG.COOKIE_MAX_AGE);
  return successResponse(c, {
    response: RESPONSE_MESSAGES.MODEL_SET_SUCCESS(model),
    model
  }, RESPONSE_MESSAGES.MODEL_SET_SUCCESS(model));
}));

export default models;
