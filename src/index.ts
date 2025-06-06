import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { securityMiddleware } from './middleware/security';
import chat from './routes/chat';
import auth from './routes/auth';
import models from './routes/models';
import roles from './routes/roles';
import context from './routes/context';
import staticFiles from './routes/static';
import packageJson from '../package.json';
import { contextManager } from './services/context';

const app = new Hono<{ Bindings: Env }>();

// Context Manager 초기화 미들웨어
app.use('*', async (c, next) => {
  contextManager.initialize(c.env);
  await next();
});

// 보안 미들웨어 적용
app.use('*', securityMiddleware);

// CORS 설정
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;

    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }

    if (origin.includes('h4o.kim')) {
      return origin;
    }

    return undefined;
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Access-Password',
    'X-Requested-With',
    'X-User-API-Key',
    'X-Session-Token'
  ],
  exposeHeaders: ['X-Total-Count'],
  credentials: true,
  maxAge: 86400,
}));

// 헬스 체크 엔드포인트
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: packageJson.version
  });
});

// 라우트 등록
app.route('/api', auth);     // 인증 라우트
app.route('/api', models);   // 모델 관리 라우트
app.route('/api', roles);    // 역할 관리 라우트
app.route('/api', context);  // 컨텍스트 관리 라우트
app.route('/api', chat);     // 채팅 라우트

// 정적 파일 라우트 (catch-all)
app.route('*', staticFiles);

export default app;
