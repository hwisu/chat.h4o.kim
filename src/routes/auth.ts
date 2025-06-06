import { Hono } from 'hono';
import type { 
  Env, 
  LoginRequest, 
  LoginResponse, 
  AuthStatusResponse, 
  SetApiKeyRequest, 
  SetApiKeyResponse 
} from '../types';
import { 
  authenticateUser, 
  getAuthStatus,
  checkAuthenticationOrUserKey as checkAuth
} from '../services/auth';
import { RESPONSE_MESSAGES, MODEL_CONFIG, HTTP_STATUS } from './constants';
import { successResponse, errorResponse, asyncHandler, parseJsonBody } from './utils';

const auth = new Hono<{ Bindings: Env }>();

// Authentication check helper for backward compatibility
export async function checkAuthenticationOrUserKey(c: any): Promise<boolean> {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
  
  return await checkAuth(sessionToken, userApiKey, jwtSecret);
}

// Login endpoint
auth.post('/login', asyncHandler(async (c) => {
  const { password } = await parseJsonBody<LoginRequest>(c, ['password']);
  
  const accessPassword = c.env.ACCESS_PASSWORD;
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';

  const result = await authenticateUser(password, accessPassword || '', jwtSecret);

  if (result.success) {
    return successResponse(c, null, result.message, {
      login_success: true,
      session_token: result.token,
      response: result.message
    });
  } else {
    return errorResponse(c, result.message, HTTP_STATUS.UNAUTHORIZED, {
      login_failed: true,
      response: result.message
    });
  }
}));

// Get authentication status
auth.get('/auth-status', asyncHandler(async (c) => {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';

  const status = await getAuthStatus(sessionToken, userApiKey, jwtSecret);
  return successResponse(c, status);
}));

// Set API key
auth.post('/set-api-key', asyncHandler(async (c) => {
  const { apiKey } = await parseJsonBody<SetApiKeyRequest>(c, ['apiKey']);

  // Validate API key format
  if (!apiKey.startsWith(MODEL_CONFIG.API_KEY_PREFIX)) {
    return errorResponse(c, `Invalid API key format. Must start with ${MODEL_CONFIG.API_KEY_PREFIX}`, HTTP_STATUS.BAD_REQUEST);
  }

  // Validate API key length
  if (apiKey.length < MODEL_CONFIG.MIN_API_KEY_LENGTH) {
    return errorResponse(c, 'Invalid API key length', HTTP_STATUS.BAD_REQUEST);
  }

  return successResponse(c, null, RESPONSE_MESSAGES.API_KEY_SET_SUCCESS, {
    message: RESPONSE_MESSAGES.API_KEY_SET_SUCCESS,
    response: RESPONSE_MESSAGES.API_KEY_VALIDATED
  });
}));

// Verify authentication (alias)
auth.get('/auth/verify', asyncHandler(async (c) => {
  const sessionToken = c.req.header('X-Session-Token');
  const userApiKey = c.req.header('X-User-API-Key');
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';

  const status = await getAuthStatus(sessionToken, userApiKey, jwtSecret);
  return successResponse(c, status);
}));

export default auth;
