import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { extractUserIdFromJWT } from '../services/auth';
import { cryptoService } from '../services/crypto';
import { secureLog } from '../services/tools/common';
import type { Env, ModelInfo, OpenRouterModel, OpenRouterModelsResponse } from '../types';
import { API_CONFIG, ErrorStatus, MODEL_CONFIG, RESPONSE_MESSAGES } from './constants';
import { asyncHandler, errorResponse, fetchWithTimeout, getCookieValue, parseJsonBody, setCookie, successResponse } from './utils';

const models = new Hono<{ Bindings: Env }>();

// Model cache with type information
interface ModelCache {
  data: ModelInfo[];
  timestamp: number;
  type: string; // 'user' | 'server' | 'user_tools' | 'server_tools' | etc.
}

let modelsCache: ModelCache | null = null;

// Transform OpenRouterModel to ModelInfo format
function transformToModelInfo(openRouterModel: OpenRouterModel, isSelected = false): ModelInfo {
  // Extract provider from model name or id
  let provider = 'Unknown';
  if (openRouterModel.name.includes(':')) {
    provider = openRouterModel.name.split(':')[0];
  } else if (openRouterModel.id.includes('/')) {
    provider = openRouterModel.id.split('/')[0];
  }

  // Clean model name - remove (free) tags and :free suffixes
  let cleanName = openRouterModel.name
    .replace(/\s*\(free\)\s*$/i, '')
    .replace(/:free\s*$/i, '');

  // Check if model supports tools
  const supportsTools = openRouterModel.supported_parameters &&
                       Array.isArray(openRouterModel.supported_parameters) &&
                       openRouterModel.supported_parameters.includes('tools');

  return {
    id: openRouterModel.id,
    name: cleanName,
    provider,
    context_length: openRouterModel.context_length,
    selected: isSelected,
    supportsTools
  };
}

// Transform array of OpenRouterModels to ModelInfos
function transformModelsArray(openRouterModels: OpenRouterModel[], selectedModelId?: string): ModelInfo[] {
  return openRouterModels.map(model =>
    transformToModelInfo(model, model.id === selectedModelId)
  );
}

// Utility Functions
function getProviderPriority(modelId: string, isUserApiKey = false): number {
  const lowerModelId = modelId.toLowerCase();

  const priorities = isUserApiKey ? MODEL_CONFIG.PREMIUM_MODEL_PRIORITIES : MODEL_CONFIG.FREE_MODEL_PRIORITIES;

  for (let i = 0; i < priorities.length; i++) {
    if (lowerModelId.includes(priorities[i])) {
      return i + 1;
    }
  }

  return priorities.length + 1; // Lower priority for unknown providers
}

function getContextSize(model: OpenRouterModel): number {
  if (model.context_length && model.context_length > 0) {
    return model.context_length;
  }

  console.warn(`⚠️ Using context size estimation for model: ${model.id}`);

  const modelId = model.id.toLowerCase();

  // Pattern-based estimation for context window sizes
  const contextPatterns = [
    { pattern: '128k', size: 128000 },  // Large context models
    { pattern: '32k', size: 32000 },    // Medium-large context models
    { pattern: '16k', size: 16000 },    // Medium context models
    { pattern: '8k', size: 8000 },      // Standard context models
    { pattern: '4k', size: 4000 }       // Small context models
  ];

  for (const { pattern, size } of contextPatterns) {
    if (modelId.includes(pattern)) return size;
  }

  // Model family context size estimation
  const familyPatterns = [
    { patterns: ['llama-3.3', 'llama-3.2', 'llama-3.1'], size: 128000 }, // Latest Llama models have large context
    { patterns: ['deepseek', 'gemini'], size: 32000 },                    // DeepSeek and Gemini typically have 32k context
    { patterns: ['gemma-2'], size: 8000 }                                 // Gemma-2 models have 8k context
  ];

  for (const { patterns, size } of familyPatterns) {
    if (patterns.some(pattern => modelId.includes(pattern))) {
      return size;
    }
  }

  return MODEL_CONFIG.CONTEXT_SIZE_FALLBACK; // Conservative default from config
}

function formatModelsResponse(models: OpenRouterModel[]): string {
  const lines = [
    `📋 Available Models (${models.length} total)`,
    '',
    ...models.map(model => model.id),
    '',
    'Usage: /set-model <model-id> or /set-model auto'
  ];

  return lines.join('\n');
}

// Filter free models with quality criteria
export function filterFreeModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return models
    .filter((m: OpenRouterModel) => {
      // Only include models ending with :free
      if (!m.id.endsWith(':free')) return false;

      // Exclude small/low-quality models
      if (m.id.toLowerCase().match(/mini|micro|small/)) return false;

      // Filter by model size (require minimum 8B parameters for quality)
      const sizeMatch = m.id.toLowerCase().match(/(\d+(?:\.\d+)?)b/);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        return size >= MODEL_CONFIG.MIN_FREE_MODEL_SIZE_B;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort by provider priority first
      const aPriority = getProviderPriority(a.id, false);
      const bPriority = getProviderPriority(b.id, false);

      if (aPriority !== bPriority) return aPriority - bPriority;

      // Then by context size (larger is better)
      const aContext = getContextSize(a);
      const bContext = getContextSize(b);
      if (aContext !== bContext) return bContext - aContext;

      // Finally by alphabetical order
      return a.id.localeCompare(b.id);
    });
}

// Filter models with function calling support
export function filterToolsSupportModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return models.filter((model: OpenRouterModel) => {
    // Check if model supports tools in supported_parameters
    const supportsTools = model.supported_parameters &&
                         Array.isArray(model.supported_parameters) &&
                         model.supported_parameters.includes('tools');

    if (!supportsTools) return false;

    // Also filter by quality criteria (same as free models)
    if (model.id.endsWith(':free')) {
      // For free models, apply quality filters
      if (model.id.toLowerCase().match(/mini|micro|small/)) return false;

      const sizeMatch = model.id.toLowerCase().match(/(\d+(?:\.\d+)?)b/);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        return size >= MODEL_CONFIG.MIN_FREE_MODEL_SIZE_B;
      }
    }

    return true;
  });
}

// Get API key (user key takes priority, including encrypted keys)
export async function getApiKey(c: any): Promise<string> {
  const userApiKey = c.req.header('X-User-API-Key');
  const sessionToken = c.req.header('X-Session-Token');
  const serverApiKey = c.env.OPENROUTER_API_KEY;

  // First try direct user API key
  if (userApiKey?.startsWith(MODEL_CONFIG.API_KEY_PREFIX)) {
    return userApiKey;
  }

  // Try encrypted user API key if session token is available
  if (sessionToken) {
    const jwtSecret = c.env.JWT_SECRET;
    if (jwtSecret) {
      const userId = await extractUserIdFromJWT(sessionToken, jwtSecret);
      if (userId) {
        const decryptedKey = await cryptoService.getDecryptedApiKey(c.env, userId);
        if (decryptedKey?.startsWith(MODEL_CONFIG.API_KEY_PREFIX)) {
          return decryptedKey;
        }
      }
    }
  }

  // Fall back to server API key
  if (serverApiKey?.trim()) {
    return serverApiKey;
  }

  throw new Error('No valid API key available');
}

// Get selected model from cookie
export function getSelectedModelFromCookie(c: any): string | undefined {
  return getCookieValue(c, 'selected_model');
}

/**
 * 모델이 Function Calling을 지원하는지 확인 (캐시된 정보 기반)
 */
export function supportsToolCalling(modelId: string): boolean {
  // 캐시된 모델 정보에서 확인
  if (modelsCache && modelsCache.data) {
    const model = modelsCache.data.find(m => m.id === modelId);
    if (model) {
      console.log(`🔧 Model ${modelId} tool support: ${model.supportsTools ? '✅ YES' : '❌ NO'} (from cache)`);
      return model.supportsTools || false;
    }
  }
  return false;
}

// Auto-select best available model
export async function autoSelectModel(c: any, apiKey: string, skipLog?: boolean): Promise<string> {
  try {
    let freeModels: OpenRouterModel[] = [];

    // Check cache first (5 minute TTL from MODEL_CONFIG)
    if (modelsCache && Date.now() - modelsCache.timestamp < MODEL_CONFIG.MODEL_CACHE_TTL_MS) {
      // Use cached data
      if (modelsCache.data.length > 0) {
        const selectedModel = modelsCache.data[0].id;
        if (!skipLog) {
          console.log(`🔄 Using cached auto-selected model: ${selectedModel}`);
        }
        return selectedModel;
      }
    }

    // Fetch fresh models if cache miss or expired
    const allModels = await fetchModels(apiKey, !!c.req.header('X-User-API-Key'));
    freeModels = filterFreeModels(allModels);

    if (freeModels.length === 0) {
      throw new Error('No suitable free models available');
    }

    // Update cache
    modelsCache = {
      data: transformModelsArray(freeModels),
      timestamp: Date.now(),
      type: c.req.header('X-User-API-Key') ? 'user' : 'server'
    };

    const selectedModel = freeModels[0].id;
    if (!skipLog) {
      console.log(`🎯 Auto-selected model: ${selectedModel}`);
    }

    return selectedModel;
  } catch (error) {
    console.error('❌ Auto-selection failed:', error);
    // Fallback to a known working free model (prefer models with better tool support)
    const fallbackModel = 'google/gemini-flash-1.5:free';
    if (!skipLog) {
      console.log(`🔄 Using fallback model: ${fallbackModel}`);
    }
    return fallbackModel;
  }
}

// Get selected model with auto-selection fallback
export async function getSelectedModel(c: any, requestedModel?: string, skipLog?: boolean): Promise<string> {
  if (requestedModel && requestedModel !== 'auto') {
    return requestedModel;
  }

  const cookieModel = getSelectedModelFromCookie(c);
  if (cookieModel && cookieModel !== 'auto') {
    return cookieModel;
  }

  const apiKey = await getApiKey(c);
  return await autoSelectModel(c, apiKey, skipLog);
}

// Fetch models from OpenRouter API
async function fetchModels(apiKey: string, hasUserApiKey: boolean): Promise<OpenRouterModel[]> {
  try {
    const response = await fetchWithTimeout(`${API_CONFIG.OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: API_CONFIG.REQUEST_TIMEOUT_MS
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: OpenRouterModelsResponse = await response.json();

    if (!data?.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from OpenRouter API');
    }

    let models = data.data;

    // Filter based on API key type
    if (!hasUserApiKey) {
      // Server API key: only show free models
      models = models.filter(model => model.id.endsWith(':free'));
    }

    console.log(`📊 Fetched ${models.length} models (${hasUserApiKey ? 'user' : 'server'} API key)`);
    return models;

  } catch (error) {
    console.error('Failed to fetch models:', error);
    throw new Error(RESPONSE_MESSAGES.MODELS_FETCH_FAILED);
  }
}

// API Routes

// Get available models
models.get('/models', authRequired, asyncHandler(async (c) => {
  try {
    const apiKey = await getApiKey(c);
    const hasUserApiKey = !!c.req.header('X-User-API-Key');
    const toolsOnly = c.req.query('tools_only') === 'true'; // 툴 지원 모델만 필터링

    // Check cache first
    const cacheKey = `${hasUserApiKey ? 'user' : 'server'}_${toolsOnly ? 'tools' : 'all'}`;
    if (modelsCache && Date.now() - modelsCache.timestamp < MODEL_CONFIG.MODEL_CACHE_TTL_MS) {
      if (modelsCache.type === cacheKey) {
        return successResponse(c, {
          models: modelsCache.data,
          cached: true,
          cache_age_ms: Date.now() - modelsCache.timestamp,
          tools_only: toolsOnly
        });
      }
    }

    // Fetch fresh models
    const openRouterModels = await fetchModels(apiKey, hasUserApiKey);
    const selectedModelId = getSelectedModelFromCookie(c) || undefined;

    let filteredModels = openRouterModels;

    // Apply filters
    if (!hasUserApiKey) {
      filteredModels = filterFreeModels(openRouterModels);
    }

    if (toolsOnly) {
      filteredModels = filterToolsSupportModels(filteredModels);
    }

    const transformedModels = transformModelsArray(filteredModels, selectedModelId);

    // Update cache
    modelsCache = {
      data: transformedModels,
      timestamp: Date.now(),
      type: cacheKey
    };

    return successResponse(c, {
      models: transformedModels,
      cached: false,
      total_available: openRouterModels.length,
      filtered_count: filteredModels.length,
      tools_only: toolsOnly,
      tools_supported_count: filterToolsSupportModels(openRouterModels).length
    });

  } catch (error) {
    console.error('Models endpoint error:', error);
    const message = error instanceof Error ? error.message : RESPONSE_MESSAGES.MODELS_FETCH_FAILED;
    return errorResponse(c, message, ErrorStatus.INTERNAL_ERROR);
  }
}));

// Set selected model
models.post('/set-model', authRequired, asyncHandler(async (c) => {
  interface SetModelRequest extends Record<string, unknown> {
    model: string;
  }

  const { model: rawModel } = await parseJsonBody<SetModelRequest>(c, ['model']);

  // Validate model parameter
  if (!rawModel || typeof rawModel !== 'string') {
    return errorResponse(c, RESPONSE_MESSAGES.INVALID_MODEL(String(rawModel)), ErrorStatus.BAD_REQUEST);
  }

  // Decode URL-encoded model ID (handle double encoding issues)
  let model = rawModel;
  try {
    // Check if the model ID is URL encoded and decode it
    if (model.includes('%')) {
      model = decodeURIComponent(model);
      console.log(`🔄 Decoded model ID: ${rawModel} -> ${model}`);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to decode model ID: ${rawModel}`, error);
    model = rawModel; // Use original if decoding fails
  }

  // Handle auto-selection
  if (model.toLowerCase() === 'auto') {
    setCookie(c, 'selected_model', 'auto', { maxAge: API_CONFIG.CACHE_DURATION / 1000 });
    return successResponse(c, { model: 'auto' }, RESPONSE_MESSAGES.MODEL_AUTO_SET_SUCCESS);
  }

  // Set specific model
  setCookie(c, 'selected_model', model, { maxAge: API_CONFIG.CACHE_DURATION / 1000 });
  return successResponse(c, { model }, RESPONSE_MESSAGES.MODEL_SET_SUCCESS);
}));

// Get currently selected model
models.get('/selected-model', authRequired, asyncHandler(async (c) => {
  try {
    const selectedModel = await getSelectedModel(c);
    return successResponse(c, { model: selectedModel });
  } catch (error) {
    console.error('Selected model error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get selected model';
    return errorResponse(c, message, ErrorStatus.INTERNAL_ERROR);
  }
}));

export default models;
