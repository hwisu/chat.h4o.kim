import { Context, Next } from 'hono';

// 보안 설정 상수
const SECURITY_CONFIG = {
  // CSP 정책 설정
  CSP_POLICIES: {
    DEFAULT_SRC: ["'self'"],
    SCRIPT_SRC: ["'self'", "'wasm-unsafe-eval'"], // WebAssembly 지원을 위해 wasm-unsafe-eval 추가
    STYLE_SRC: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    FONT_SRC: ["'self'", "https://fonts.gstatic.com"],
    CONNECT_SRC: [
      "'self'", 
      "https://openrouter.ai", 
      "https://api.search.brave.com",
      "https://api.anthropic.com", // Claude API
      "https://api.openai.com" // OpenAI API
    ],
    IMG_SRC: ["'self'", "data:", "https:"],
    MEDIA_SRC: ["'self'"],
    OBJECT_SRC: ["'none'"],
    BASE_URI: ["'self'"],
    FORM_ACTION: ["'self'"],
    FRAME_ANCESTORS: ["'none'"],
    WORKER_SRC: ["'self'"],
    MANIFEST_SRC: ["'self'"]
  },
  
  // HSTS 설정
  HSTS_MAX_AGE: 31536000, // 1년
  
  // Rate limiting은 Cloudflare 설정으로 대체
  // wrangler.toml에서 설정하거나 Cloudflare Dashboard에서 관리
};

// Rate limiting은 Cloudflare에서 처리
// Dashboard > Security > WAF > Rate limiting rules에서 설정

// 악의적인 요청 패턴 감지
function detectMaliciousRequest(c: Context): boolean {
  const url = c.req.url;
  const userAgent = c.req.header('user-agent') || '';
  const referer = c.req.header('referer') || '';
  
  // 의심스러운 패턴들
  const suspiciousPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS 시도
    /javascript:/i, // Javascript 프로토콜
    /data:text\/html/i, // Data URI XSS
    /vbscript:/i, // VBScript 프로토콜
    /expression\(/i, // CSS expression
    /onload=/i, // Event handler
    /onerror=/i, // Event handler
    /\bselect\b.*\bfrom\b/i, // SQL injection 시도
    /\bunion\b.*\bselect\b/i, // SQL injection 시도
    /drop\s+table/i, // SQL injection 시도
    /\bexec\b/i, // Command injection
    /system\(/i, // Command injection
    /eval\(/i, // Code injection
    /require\(/i, // Node.js 함수 호출
    /import\(/i // Dynamic import
  ];
  
  // URL과 헤더에서 의심스러운 패턴 검사
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(userAgent) || pattern.test(referer)) {
      return true;
    }
  }
  
  // 비정상적으로 긴 헤더 검사
  if (userAgent.length > 1000 || referer.length > 2000) {
    return true;
  }
  
  return false;
}

// CSP 정책 생성
function generateCSP(): string {
  const policies = SECURITY_CONFIG.CSP_POLICIES;
  
  return [
    `default-src ${policies.DEFAULT_SRC.join(' ')}`,
    `script-src ${policies.SCRIPT_SRC.join(' ')}`,
    `style-src ${policies.STYLE_SRC.join(' ')}`,
    `font-src ${policies.FONT_SRC.join(' ')}`,
    `connect-src ${policies.CONNECT_SRC.join(' ')}`,
    `img-src ${policies.IMG_SRC.join(' ')}`,
    `media-src ${policies.MEDIA_SRC.join(' ')}`,
    `object-src ${policies.OBJECT_SRC.join(' ')}`,
    `base-uri ${policies.BASE_URI.join(' ')}`,
    `form-action ${policies.FORM_ACTION.join(' ')}`,
    `frame-ancestors ${policies.FRAME_ANCESTORS.join(' ')}`,
    `worker-src ${policies.WORKER_SRC.join(' ')}`,
    `manifest-src ${policies.MANIFEST_SRC.join(' ')}`,
    'upgrade-insecure-requests',
    'block-all-mixed-content',
    'report-uri /api/csp-report'
  ].join('; ');
}

// 메인 보안 미들웨어
export async function securityMiddleware(c: Context, next: Next) {
  const startTime = Date.now();
  
  // 1. HTTPS 강제 (프로덕션 환경에서만)
  const isProduction = c.env?.NODE_ENV === 'production' || c.env?.ENVIRONMENT === 'production';
  const protocol = c.req.header('x-forwarded-proto') || c.req.header('cf-visitor')?.includes('https') ? 'https' : 'http';
  
  if (isProduction && protocol !== 'https') {
    const httpsUrl = c.req.url.replace(/^http:/, 'https:');
    return c.redirect(httpsUrl, 301);
  }
  
  // 2. 클라이언트 IP 추출 (Cloudflare Workers 환경 고려)
  const clientIP = c.req.header('cf-connecting-ip') || 
                   c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
                   c.req.header('x-real-ip') || 
                   'unknown';
  
  // 3. Rate limiting은 Cloudflare에서 처리됨
  
  // 5. 악의적인 요청 패턴 감지
  if (detectMaliciousRequest(c)) {
    console.warn(`[SECURITY] Malicious request detected from IP: ${clientIP.substring(0, 8)}***`);
    return c.json({ error: 'Request blocked for security reasons.' }, 403);
  }
  
  // 6. 요청 크기 제한 (Cloudflare Workers는 기본적으로 100MB 제한)
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB 제한
    console.warn(`[SECURITY] Request too large: ${contentLength} bytes from IP: ${clientIP.substring(0, 8)}***`);
    return c.json({ error: 'Request entity too large.' }, 413);
  }
  
  // 7. 다음 미들웨어/핸들러 실행
  await next();
  
  // 8. 응답 후 보안 헤더 설정
  
  // 기본 보안 헤더
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // 권한 정책 (불필요한 브라우저 API 비활성화)
  c.header('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'ambient-light-sensor=()',
    'battery=()',
    'bluetooth=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=()',
    'execution-while-not-rendered=()',
    'execution-while-out-of-viewport=()',
    'fullscreen=(self)',
    'gamepad=()',
    'hid=()',
    'identity-credentials-get=()',
    'idle-detection=()',
    'local-fonts=()',
    'midi=()',
    'navigation-override=()',
    'otp-credentials=()',
    'payment=()',
    'picture-in-picture=()',
    'publickey-credentials-create=()',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'serial=()',
    'speaker-selection=()',
    'storage-access=()',
    'usb=()',
    'web-share=()',
    'window-management=()',
    'xr-spatial-tracking=()'
  ].join(', '));
  
  // Enhanced Content Security Policy
  c.header('Content-Security-Policy', generateCSP());
  
  // HTTPS 관련 헤더 (HTTPS 환경에서만)
  if (protocol === 'https') {
    // Strict Transport Security
    c.header('Strict-Transport-Security', 
      `max-age=${SECURITY_CONFIG.HSTS_MAX_AGE}; includeSubDomains; preload`);
    
    // Certificate Transparency 모니터링
    c.header('Expect-CT', 'max-age=86400, enforce');
  }
  
  // Cross-Origin 정책
  c.header('Cross-Origin-Embedder-Policy', 'require-corp');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  
  // 캐시 제어 (민감한 응답은 캐시하지 않음)
  const path = new URL(c.req.url).pathname;
  if (path.includes('/api/') || path.includes('/auth/')) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
  }
  
  // 서버 정보 숨김
  c.header('Server', 'CloudflareWorkers');
  
  // 응답 시간 로깅 (성능 모니터링용)
  const responseTime = Date.now() - startTime;
  if (responseTime > 5000) { // 5초 이상 걸린 요청 로깅
    console.warn(`[PERFORMANCE] Slow response: ${responseTime}ms for ${path} from IP: ${clientIP.substring(0, 8)}***`);
  }
  
  // 보안 헤더 검증 (개발 환경에서만)
  if (!isProduction) {
    console.log(`[SECURITY] Headers applied for ${path}`);
  }
}



// Rate limiting은 Cloudflare Dashboard에서 설정하세요:
// 1. Dashboard > Security > WAF 
// 2. Rate limiting rules 추가
// 3. 예: 초당 10회 이상 요청 시 1분간 차단
