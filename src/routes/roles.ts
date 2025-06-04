import { Hono } from 'hono';
import { Env } from '../types';
import { AVAILABLE_ROLES, getRoleById, getPublicRoleInfo } from '../roles';
import { checkAuthenticationOrUserKey } from './auth';

const roles = new Hono<{ Bindings: Env }>();

// Role management - session-based storage
let userRoles: Map<string, string> = new Map(); // sessionId -> roleId

function getUserRole(sessionId: string): string {
  return userRoles.get(sessionId) || 'general';
}

function setUserRole(sessionId: string, roleId: string): void {
  userRoles.set(sessionId, roleId);
}

function getSessionId(c: any): string {
  // Use session token if available
  const sessionToken = c.req.header('X-Session-Token');
  if (sessionToken) {
    return sessionToken;
  }

  // Fallback to IP address for user API key scenarios
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'anonymous';
}

// Export getUserRole function for use in chat module
export { getUserRole, getSessionId };

// GET /api/roles - 사용 가능한 롤 목록 반환
roles.get('/roles', async (c) => {
  // Check authentication first
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    // Return only public information (no system prompts)
    const publicRoles = AVAILABLE_ROLES.map(role => getPublicRoleInfo(role));

    return c.json({
      success: true,
      roles: publicRoles
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return c.json({
      error: 'Failed to fetch roles',
      success: false
    }, 500);
  }
});

// POST /api/set-role - 롤 선택 처리
roles.post('/set-role', async (c) => {
  // Check authentication first
  if (!await checkAuthenticationOrUserKey(c)) {
    return c.json({
      error: 'Authentication required',
      auth_required: true
    }, 401);
  }

  try {
    const { role: roleId } = await c.req.json();

    if (!roleId) {
      return c.json({
        error: 'Role ID is required',
        success: false
      }, 400);
    }

    // Validate role exists
    const role = getRoleById(roleId);
    if (!role) {
      return c.json({
        error: `Invalid role: ${roleId}`,
        success: false
      }, 400);
    }

    // Get session identifier
    const sessionId = getSessionId(c);

    // Store the selected role for this session
    setUserRole(sessionId, roleId);

    console.log(`🎭 Role set: ${sessionId} -> ${roleId}`);

    return c.json({
      success: true,
      role: getPublicRoleInfo(role),
      message: `Role set to: ${role.name}`
    });

  } catch (error) {
    console.error('Error setting role:', error);
    return c.json({
      error: 'Failed to set role',
      success: false
    }, 500);
  }
});

export default roles;
