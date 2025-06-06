import { Hono } from 'hono';
import { Env } from '../types';
import jwt from 'jsonwebtoken';

const auth = new Hono<{ Bindings: Env }>();

// Advanced encryption function for login tokens using JWT
async function encryptPassword(password: string, secret: string): Promise<string> {
  // 토큰 만료 시간 (24시간)
  const expiresIn = 24 * 60 * 60;

  // 랜덤 값 생성
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const nonce = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');

  // JWT 페이로드 구성
  const payload = {
    pwd: password,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    nonce: nonce,
    iss: "chatty-h4o"
  };

  // JWT 서명
  const token = jwt.sign(payload, secret);
  return token;
}

// Check if user is authenticated OR has valid user API key
export async function checkAuthenticationOrUserKey(c: any): Promise<boolean> {
  const userApiKey = c.req.header('X-User-API-Key');

  if (userApiKey && userApiKey.startsWith('sk-or-v1-')) {
    return true;
  }

  const sessionToken = c.req.header('X-Session-Token');

  if (sessionToken) {
    try {
      const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
      jwt.verify(sessionToken, jwtSecret);
      return true;
    } catch (error) {
      console.warn('Invalid session token:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  return false;
}

// POST /api/login - 로그인 처리
auth.post('/login', async (c) => {
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
    const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';

    if (password === accessPassword) {
      const encryptedToken = await encryptPassword(password, jwtSecret);

      return c.json({
        login_success: true,
        session_token: encryptedToken, // Send token to client for session storage
        response: `✅ Server login successful!\n\n📡 Using server API key\n\n💬 Main Commands:\n• /models - List available AI models\n• /set-model <id> - Set specific model\n• /set-model auto - Use auto-selection\n• /roles - List available AI roles\n• /set-role <role-id> - Set AI personality\n• /clear - Clear conversation history\n• /help - Show all commands\n\n🔄 Session expires when tab closes`
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

// 인증 상태 확인 함수
async function getAuthStatusResponse(c: any) {
  const userApiKey = c.req.header('X-User-API-Key');
  const hasUserKey = userApiKey && userApiKey.startsWith('sk-or-v1-');

  if (hasUserKey) {
    return {
      authenticated: true,
      auth_method: 'user_api_key',
      auth_type: 'Personal API Key'
    };
  }

  const isServerAuth = await checkAuthenticationOrUserKey(c);

  if (isServerAuth) {
    return {
      authenticated: true,
      auth_method: 'server_password',
      auth_type: 'Server Password'
    };
  }

  return {
    authenticated: false,
    auth_method: null,
    auth_type: null
  };
}

auth.get('/auth-status', async (c) => {
  return c.json(await getAuthStatusResponse(c));
});

auth.get('/auth/verify', async (c) => {
  return c.json(await getAuthStatusResponse(c));
});

export default auth;
