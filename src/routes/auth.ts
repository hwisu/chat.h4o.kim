import { Hono } from 'hono';
import {
  authenticateUser,
  getAuthStatus
} from '../services/auth';
import type {
  Env,
  LoginRequest,
  SetApiKeyRequest
} from '../types';
import { HttpStatus, MODEL_CONFIG, ResponseMessage } from './constants';
import { asyncHandler, errorResponse, parseJsonBody, successResponse } from './utils';

const auth = new Hono<{ Bindings: Env }>();

// Login endpoint
auth.post('/login', asyncHandler(async (c) => {
  const { password } = await parseJsonBody<LoginRequest>(c, ['password']);
  
  const accessPassword = c.env.ACCESS_PASSWORD;
  const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';

  const result = await authenticateUser(password, accessPassword || '', jwtSecret);

  if (result.success) {
      return successResponse(c, {
    login_success: true,
    session_token: result.token
  }, ResponseMessage.LOGIN_SUCCESS);
  }

  return errorResponse(c, result.message, HttpStatus.UNAUTHORIZED, {
    login_failed: true
  });
}));

// Get authentication status - single endpoint
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
    return errorResponse(
      c, 
      `Invalid API key format. Must start with ${MODEL_CONFIG.API_KEY_PREFIX}`, 
      HttpStatus.BAD_REQUEST
    );
  }

  // Validate API key length
  if (apiKey.length < MODEL_CONFIG.MIN_API_KEY_LENGTH) {
    return errorResponse(c, 'Invalid API key length', HttpStatus.BAD_REQUEST);
  }

  return successResponse(c, {
    api_key_set: true
  }, ResponseMessage.API_KEY_SET_SUCCESS);
}));

export default auth;
