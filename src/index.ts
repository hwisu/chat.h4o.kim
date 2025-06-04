import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { securityMiddleware } from './middleware/security';
import chat from './routes/chat';
import staticFiles from './routes/static';

const app = new Hono<{ Bindings: Env }>();

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
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Access-Password',
    'X-Requested-With'
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
    version: '1.0.5'
  });
});

// API routes
app.route('/api', chat);

// Static file serving (SPA fallback) - must be last
app.route('*', staticFiles);

export default app;
