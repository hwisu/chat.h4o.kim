import { Hono } from 'hono';
import { Env } from '../types';
import { AVAILABLE_ROLES, getRoleById, getPublicRoleInfo } from '../roles';
import { authRequired } from '../middleware/auth';
import { RESPONSE_MESSAGES, HTTP_STATUS } from './constants';
import { successResponse, errorResponse, asyncHandler, parseJsonBody } from './utils';

const roles = new Hono<{ Bindings: Env }>();

// In-memory role storage for sessions
const userRoles = new Map<string, string>();

// Helper functions
function getUserRole(sessionId: string): string {
  return userRoles.get(sessionId) || 'general';
}

function setUserRole(sessionId: string, roleId: string): void {
  userRoles.set(sessionId, roleId);
}

function getSessionId(c: any): string {
  const sessionToken = c.req.header('X-Session-Token');
  if (sessionToken) return sessionToken;
  
  return c.req.header('CF-Connecting-IP') || 
         c.req.header('X-Forwarded-For') || 
         'anonymous';
}

// Export for use in other modules
export { getUserRole, getSessionId };

// Get available roles
roles.get('/roles', authRequired, asyncHandler(async (c) => {
  const publicRoles = AVAILABLE_ROLES.map(role => getPublicRoleInfo(role));
  return successResponse(c, { roles: publicRoles });
}));

// Set user role
roles.post('/set-role', authRequired, asyncHandler(async (c) => {
  const { role: roleId } = await parseJsonBody<{ role: string }>(c, ['role']);

  // Validate role exists
  const role = getRoleById(roleId);
  if (!role) {
    return errorResponse(c, RESPONSE_MESSAGES.INVALID_ROLE(roleId), HTTP_STATUS.BAD_REQUEST);
  }

  // Store role for session
  const sessionId = getSessionId(c);
  setUserRole(sessionId, roleId);



  return successResponse(c, {
    role: getPublicRoleInfo(role)
  }, RESPONSE_MESSAGES.ROLE_SET_SUCCESS(role.name));
}));

export default roles;
