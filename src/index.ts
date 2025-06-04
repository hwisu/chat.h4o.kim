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
import { contextManager } from './services/context-manager';

const app = new Hono<{ Bindings: Env }>();

// DB 초기화 미들웨어 (모든 요청 전에 실행)
app.use('*', async (c, next) => {
  // ContextManager에 D1 데이터베이스 연결
  contextManager.setDatabase(c.env.DB);
  await next();
});

// Security headers middleware (applied first)
app.use('*', securityMiddleware);

// Enhanced CORS configuration with stricter settings
app.use('*', cors({
  origin: (origin) => {
    // Allow requests without origin (like direct API calls)
    if (!origin) return origin;

    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }

    // Allow your Cloudflare Workers domain
    if (origin.includes('.workers.dev') || origin.includes('h4o.kim')) {
      return origin;
    }

    // Deny all other origins
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
  maxAge: 86400, // 24 hours
}));

// Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: packageJson.version
  });
});

// API routes
app.route('/api', auth);     // Authentication routes
app.route('/api', models);   // Model management routes
app.route('/api', roles);    // Role management routes
app.route('/api', context);  // Context management routes
app.route('/api', chat);     // Chat and other routes

// Static file serving (SPA fallback) - must be last
app.route('*', staticFiles);

export default app;
