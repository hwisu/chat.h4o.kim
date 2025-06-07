import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { AVAILABLE_ROLES, getPublicRoleInfo, getRoleById } from '../roles';
import { Env } from '../types';
import { ErrorStatus, RESPONSE_MESSAGES } from './constants';
import { asyncHandler, errorResponse, parseJsonBody, successResponse } from './utils';

const roles = new Hono<{ Bindings: Env }>();

// In-memory role storage for users
const userRoles = new Map<string, string>();

// Helper functions
function getUserRole(userId: string): string {
  return userRoles.get(userId) || 'general';
}

function setUserRole(userId: string, roleId: string): void {
  userRoles.set(userId, roleId);
}

// Export for use in other modules
export { getUserRole };

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
    return errorResponse(c, RESPONSE_MESSAGES.INVALID_ROLE(roleId), ErrorStatus.BAD_REQUEST);
  }

  // Store role for user
  const userId = c.get('userId') || 'anonymous';
  setUserRole(userId, roleId);

  return successResponse(c, {
    role: getPublicRoleInfo(role)
  }, RESPONSE_MESSAGES.ROLE_SET_SUCCESS(role.name));
}));

export default roles;
