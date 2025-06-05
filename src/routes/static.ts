import { Hono } from 'hono';
import { Env } from '../types';

const staticFiles = new Hono<{ Bindings: Env }>();

// Serve static files with proper fallback
async function serveStaticFile(c: any, fileName: string = 'index.html') {
  console.log('STATIC HANDLER: Serving file =', fileName);

  try {
    // Check if ASSETS binding is available (for production)
    if (c.env.ASSETS) {
      const url = new URL(c.req.url);
      url.pathname = `/${fileName}`;
      const response = await c.env.ASSETS.fetch(url);

      if (response.ok) {
        return response;
      }

      // If file not found, serve index.html for SPA fallback
      if (response.status === 404 && fileName !== 'index.html') {
        url.pathname = '/index.html';
        const fallbackResponse = await c.env.ASSETS.fetch(url);
        if (fallbackResponse.ok) {
          return fallbackResponse;
        }
      }

      return response;
    } else {
      // Fallback for local development
      console.log('ASSETS binding not available, returning fallback message');
      return c.html(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Terminal Chat - Development Mode</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            background: #0a0a0a;
            color: #00ff00;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            text-align: center;
        }
        .dev-message {
            background: #1a1a1a;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 40px;
            max-width: 500px;
        }
        .title {
            color: #00ff00;
            font-size: 24px;
            margin-bottom: 20px;
        }
        .message {
            color: #ffffff;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .link {
            color: #0088ff;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="dev-message">
        <div class="title">🔧 Development Mode</div>
        <div class="message">
            ASSETS binding is not available in local development.<br/>
            Please run <code>wrangler dev</code> to test with proper asset serving,<br/>
            or deploy to Cloudflare Workers for full functionality.
        </div>
    </div>
</body>
</html>
      `);
    }
  } catch (error) {
    console.error('Error serving static file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text('Error loading application: ' + errorMessage, 500);
  }
}

// Serve index.html for root and SPA fallback
staticFiles.get('/', async (c) => {
  console.log('STATIC HANDLER: Root path requested');
  return serveStaticFile(c, 'index.html');
});

// Serve index.html explicitly
staticFiles.get('/index.html', async (c) => {
  console.log('STATIC HANDLER: index.html requested');
  return serveStaticFile(c, 'index.html');
});

// Serve manifest.json
staticFiles.get('/manifest.json', async (c) => {
  console.log('STATIC HANDLER: manifest.json requested');
  return serveStaticFile(c, 'manifest.json');
});

// Serve service worker
staticFiles.get('/sw.js', async (c) => {
  console.log('STATIC HANDLER: sw.js requested');
  return serveStaticFile(c, 'sw.js');
});

// Handle all other routes with SPA fallback
staticFiles.get('*', async (c) => {
  const path = c.req.path;
  console.log('STATIC HANDLER: Catch-all for path =', path);

  // Try to serve the requested file first
  if (path !== '/' && !path.startsWith('/api/')) {
    const fileName = path.startsWith('/') ? path.slice(1) : path;

    // Try to serve the specific file
    try {
      if (c.env.ASSETS) {
        const url = new URL(c.req.url);
        const response = await c.env.ASSETS.fetch(url);

        if (response.ok) {
          return response;
        }
      }
    } catch (error) {
      console.log('File not found, falling back to SPA:', fileName);
    }
  }

  // Fall back to index.html for SPA routing
  return serveStaticFile(c, 'index.html');
});

export default staticFiles;
