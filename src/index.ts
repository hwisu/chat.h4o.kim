import { Hono } from 'hono';
import { cors } from 'hono/cors';
import packageJson from '../package.json';
import { validateEnvironment } from './middleware/env-validation';
import { securityMiddleware } from './middleware/security';
import auth from './routes/auth';
import chat from './routes/chat';
import context from './routes/context';
import cryptoAuth from './routes/cryptoAuth';
import models from './routes/models';
import roles from './routes/roles';
import staticFiles from './routes/static';
import { contextManager } from './services/context';
import { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Environment validation middleware (first priority)
app.use('*', validateEnvironment);

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

// CSP violation 리포트 엔드포인트
app.post('/api/csp-report', async (c) => {
  try {
    const report = await c.req.json();
    
    // CSP 위반 로깅 (실제 환경에서는 보안 모니터링 시스템으로 전송)
    console.warn('[CSP VIOLATION]', {
      'document-uri': report['csp-report']?.['document-uri'],
      'violated-directive': report['csp-report']?.['violated-directive'],
      'blocked-uri': report['csp-report']?.['blocked-uri'],
      'line-number': report['csp-report']?.['line-number'],
      'column-number': report['csp-report']?.['column-number'],
      'source-file': report['csp-report']?.['source-file']
    });
    
    c.status(204);
    return c.text('');
  } catch (error) {
    console.error('[CSP REPORT ERROR]', error);
    return c.json({ error: 'Invalid report format' }, 400);
  }
});

// 라우트 등록
app.route('/api', auth);        // 인증 라우트
app.route('/api', cryptoAuth);  // 암호화 인증 라우트
app.route('/api', models);      // 모델 관리 라우트
app.route('/api', roles);       // 역할 관리 라우트
app.route('/api', context);     // 컨텍스트 관리 라우트
app.route('/api', chat);        // 채팅 라우트

// 정적 파일 라우트 (catch-all)
app.route('*', staticFiles);

export default app;
