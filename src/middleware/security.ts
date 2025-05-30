import { Context, Next } from 'hono';

export async function securityMiddleware(c: Context, next: Next) {
  await next();

  // Set security headers
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Content Security Policy
  c.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for our app
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Allow Google Fonts
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://openrouter.ai",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));

  // Strict Transport Security (HTTPS only)
  if (c.req.header('x-forwarded-proto') === 'https') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}
