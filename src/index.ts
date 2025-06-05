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

app.use('*', async (c, next) => {
  contextManager.setDatabase(c.env.DB);
  await next();
});

app.use('*', securityMiddleware);

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

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: packageJson.version
  });
});

app.route('/api', auth);     // Authentication routes
app.route('/api', models);   // Model management routes
app.route('/api', roles);    // Role management routes
app.route('/api', context);  // Context management routes
app.route('/api', chat);     // Chat and other routes

app.route('*', staticFiles);

export default app;
