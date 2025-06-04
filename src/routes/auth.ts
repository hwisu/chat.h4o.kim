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

// Advanced decryption function for login tokens
async function decryptPassword(encrypted: string, secret: string): Promise<string | null> {
  try {
    const parts = encrypted.split('.');

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

// Check if user is authenticated OR has valid user API key
export async function checkAuthenticationOrUserKey(c: any): Promise<boolean> {
  const userApiKey = c.req.header('X-User-API-Key');

  if (userApiKey && userApiKey.startsWith('sk-or-v1-')) {
    // console.log('Access granted with user API key');
    return true;
  }

  const sessionToken = c.req.header('X-Session-Token');

  if (sessionToken) {
    try {
      const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
      const payload = jwt.verify(sessionToken, jwtSecret);
      // console.log('Access granted with session token');
      return true;
    } catch (error) {
      console.warn('Invalid session token:', error);
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
        response: `✅ Server login successful!\n\n📡 Using server API key\n\n💬 Commands:\n• /models - List models\n• /set-model <id> - Set model\n• /clear - Clear chat\n• /help - Show help\n\n🔄 Session expires when tab closes`
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

export async function getAuthStatus(c: any) {
  const userApiKey = c.req.header('X-User-API-Key');
  const sessionToken = c.req.header('X-Session-Token');

  // console.log('Auth check:', {
  //   hasUserApiKey: !!userApiKey,
  //   hasSessionToken: !!sessionToken,
  //   userApiKeyValid: userApiKey?.startsWith('sk-or-v1-'),
  //   sessionTokenLength: sessionToken?.length
  // });

  if (userApiKey && userApiKey.startsWith('sk-or-v1-')) {
    return {
      authenticated: true,
      auth_method: 'user_api_key',
      auth_type: 'personal'
    };
  }

  if (sessionToken) {
    try {
      const jwtSecret = c.env.JWT_SECRET || c.env.OPENROUTER_API_KEY || 'default-secret-key';
      const payload = jwt.verify(sessionToken, jwtSecret);
      return {
        authenticated: true,
        auth_method: 'session_token',
        auth_type: 'server'
      };
    } catch (error) {
      console.warn('Session token verification failed:', error);
    }
  }

  return {
    authenticated: false,
    auth_method: null,
    auth_type: null
  };
}

auth.get('/auth-status', async (c) => {
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

auth.get('/auth/verify', async (c) => {
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


export default auth;
