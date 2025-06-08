/**
 * Function Calling Tools Service
 * 모델이 사용할 수 있는 도구들을 정의하고 실행하는 서비스
 */

// 보안 상수 정의
const SECURITY_CONFIG = {
  MAX_QUERY_LENGTH: 500,
  MAX_RESULTS_LIMIT: 10,
  ALLOWED_DOMAINS: [
    'api.search.brave.com',
    'openrouter.ai'
  ],
  REQUEST_TIMEOUT: 10000,
  SUMMARIZER_TIMEOUT: 15000
};

// 입력 검증 및 새니타이징 함수
function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input: must be a non-empty string');
  }
  
  // 길이 제한
  if (input.length > SECURITY_CONFIG.MAX_QUERY_LENGTH) {
    throw new Error(`Input too long: maximum ${SECURITY_CONFIG.MAX_QUERY_LENGTH} characters allowed`);
  }
  
  // 기본 새니타이징: 위험한 문자 제거
  const sanitized = input
    .trim()
    .replace(/[<>\"'&]/g, '') // XSS 방지를 위한 기본 문자 제거
    .replace(/javascript:/gi, '') // javascript: 프로토콜 제거
    .replace(/data:/gi, '') // data: 프로토콜 제거
    .replace(/vbscript:/gi, ''); // vbscript: 프로토콜 제거
  
  if (!sanitized) {
    throw new Error('Invalid input: contains only forbidden characters');
  }
  
  return sanitized;
}

// HTML/XSS 방지를 위한 출력 새니타이징
function sanitizeOutput(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// URL 검증 함수
function isValidApiUrl(url: string, allowedDomains: string[]): boolean {
  try {
    const parsedUrl = new URL(url);
    return allowedDomains.includes(parsedUrl.hostname) && 
           (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:');
  } catch {
    return false;
  }
}

// Rate limiting을 위한 간단한 캐시 (실제 환경에서는 Redis 등 사용 권장)
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const cached = rateLimitCache.get(identifier);
  
  if (!cached || now > cached.resetTime) {
    rateLimitCache.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (cached.count >= maxRequests) {
    return false;
  }
  
  cached.count++;
  return true;
}

// 보안 로깅 함수 (민감한 정보 마스킹)
function secureLog(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
  // 프로덕션 환경에서는 로깅 레벨 제한
  if (process.env.NODE_ENV === 'production' && level === 'info') {
    return;
  }
  
  // 민감한 정보 마스킹
  const maskedData = data ? JSON.stringify(data).replace(/api[_-]?key[\"']?\s*:\s*[\"']?[^\"',\s]+/gi, 'api_key: "***"') : '';
  
  console[level](`[SECURITY] ${message}`, maskedData ? ` | Data: ${maskedData}` : '');
}

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
  source?: string;
  relevanceScore?: number;
  domain?: string;
}

export interface SummaryResult {
  summary: string;
  sources: string[];
  query: string;
  timestamp: string;
  source: string;
}

/**
 * 웹 검색 도구 - Brave Search API 사용 (무료 월 2,000 쿼리)
 * 
 * 장점:
 * - 독립적인 인덱스 (30억+ 페이지)
 * - 실시간 뉴스 및 최신 정보 제공
 * - AI inference 권한 포함
 * - 빠른 성능 (95% < 1초)
 * 
 * 설정: 환경변수 BRAVE_SEARCH_API_KEY 필요
 * 무료: 월 2,000 쿼리 (1 QPS)
 * 가입: https://api.search.brave.com
 */
export async function searchWeb(query: string, maxResults: number = 5, env?: any): Promise<ToolResult<{
  query: string;
  results: SearchResult[];
  timestamp: string;
  source: string;
  totalResults?: number;
  searchTime?: number;
}>> {
  try {
    // 입력 검증 및 새니타이징
    let sanitizedQuery: string;
    try {
      sanitizedQuery = sanitizeInput(query);
    } catch (error) {
      secureLog('warn', 'Invalid search query input', { error: error instanceof Error ? error.message : 'Unknown' });
      return {
        success: false,
        error: '검색어가 유효하지 않습니다. 특수 문자를 제거하고 다시 시도해주세요.',
        data: {
          query: query.substring(0, 50) + '...', // 로깅용으로 일부만
          results: [],
          timestamp: new Date().toISOString(),
          source: 'Input Validation Error'
        }
      };
    }
    
    // Rate limiting 체크
    const clientId = env?.CF_RAY || 'default'; // Cloudflare Workers의 경우 CF_RAY 사용
    if (!checkRateLimit(`search_${clientId}`, 30, 60000)) { // 분당 30회 제한
      secureLog('warn', 'Rate limit exceeded for search', { clientId: clientId.substring(0, 8) });
      return {
        success: false,
        error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        data: {
          query: sanitizedQuery,
          results: [],
          timestamp: new Date().toISOString(),
          source: 'Rate Limit Error'
        }
      };
    }
    
    // maxResults 검증
    const validatedMaxResults = Math.min(Math.max(1, maxResults || 5), SECURITY_CONFIG.MAX_RESULTS_LIMIT);
    
    // 환경변수에서 API 키 확인 (Cloudflare Workers 환경 고려)
    const apiKey = env?.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
    
    if (!apiKey) {
      secureLog('error', 'Missing API key configuration');
      return {
        success: false,
        error: 'Search service is temporarily unavailable. Please try again later.',
        data: {
          query: sanitizedQuery,
          results: [],
          timestamp: new Date().toISOString(),
          source: 'Configuration Error'
        }
      };
    }

    // 검색 시작 시간 기록
    const searchStartTime = Date.now();

    // 🔧 기본 검색을 영어로 설정 (더 좋은 결과를 위해)
    // 🕒 날짜 기반 검색 최적화: 특정 연도가 포함된 경우 freshness 조정
    let freshnessParam = 'pw'; // 기본: 최근 1주일
    const currentYear = new Date().getFullYear();
    const queryYear = sanitizedQuery.match(/\b(20\d{2})\b/)?.[1];
    
    if (queryYear) {
      const requestedYear = parseInt(queryYear);
      const yearDiff = currentYear - requestedYear;
      
      if (yearDiff >= 2) {
        // 2년 이상 과거: 모든 기간 검색
        freshnessParam = '';
      } else if (yearDiff === 1) {
        // 작년: 최근 1년
        freshnessParam = 'py';
      } else if (requestedYear === currentYear) {
        // 올해: 최근 1개월
        freshnessParam = 'pm';
      }
    }
    
    const params = new URLSearchParams({
      q: encodeURIComponent(sanitizedQuery.trim()),
      count: validatedMaxResults.toString(),
      search_lang: 'en', // 영어 검색 (기본)
      ui_lang: 'en-US', // 영어 UI
      safesearch: 'strict', // 보안상 strict 모드 사용
      textDecorations: 'false' // 하이라이트 제거로 파싱 단순화
    });
    
    // freshness 파라미터 조건부 추가
    if (freshnessParam) {
      params.set('freshness', freshnessParam);
    }
    
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?${params}`;
    
    // URL 검증
    if (!isValidApiUrl(searchUrl, SECURITY_CONFIG.ALLOWED_DOMAINS)) {
      secureLog('error', 'Invalid API URL detected');
      return {
        success: false,
        error: 'Search service error. Please contact support.',
        data: {
          query: sanitizedQuery,
          results: [],
          timestamp: new Date().toISOString(),
          source: 'URL Validation Error'
        }
      };
    }
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'ChatH4O/1.0 (Korean Language Support)'
      },
      signal: AbortSignal.timeout(SECURITY_CONFIG.REQUEST_TIMEOUT)
    });

    const searchTime = Date.now() - searchStartTime;

    if (!response.ok) {
      secureLog('warn', 'Brave Search API error', { status: response.status });
      const errorMessage = response.status === 429 
        ? '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
        : response.status === 401 
        ? 'Search service authentication failed.'
        : 'Search service is temporarily unavailable.';
        
      return {
        success: false,
        error: errorMessage,
        data: {
          query: sanitizedQuery,
          results: [],
          timestamp: new Date().toISOString(),
          source: 'Brave Search API Error',
          searchTime
        }
      };
    }

    const data = await response.json() as any;
    const results: SearchResult[] = [];

    // Brave Search 결과 파싱 (개선된 메타데이터 포함)
    if (data.web && data.web.results && Array.isArray(data.web.results)) {
      for (const item of data.web.results.slice(0, validatedMaxResults)) {
        try {
          const url = new URL(item.url);
          results.push({
            title: sanitizeOutput(item.title || 'No title'),
            url: item.url || '',
            snippet: sanitizeOutput(item.description || 'No description available'),
            source: 'Brave Search',
            domain: url.hostname,
            published: item.age || undefined,
            relevanceScore: item.score || undefined
          });
        } catch (urlError) {
          secureLog('warn', 'Invalid URL in search results', { url: item.url });
          // 유효하지 않은 URL은 건너뛰기
          continue;
        }
      }
    }
  
    // 결과가 없는 경우 한국어라면 AI 번역으로 재시도
    if (results.length === 0) {
      const hasKorean = /[가-힣]/.test(sanitizedQuery);
      
      if (hasKorean) {
        secureLog('info', 'Retrying search with AI translation');
        
        // OpenRouter API 키 가져오기
        const openrouterApiKey = env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
        let englishQuery = sanitizedQuery;
        
        if (openrouterApiKey) {
          try {
            const translationUrl = 'https://openrouter.ai/api/v1/chat/completions';
            
            // URL 검증
            if (!isValidApiUrl(translationUrl, SECURITY_CONFIG.ALLOWED_DOMAINS)) {
              throw new Error('Invalid translation API URL');
            }
            
            const translationResponse = await fetch(translationUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openrouterApiKey}`,
                'Content-Type': 'application/json',
                'X-Title': 'ChatH4O Translation Service'
              },
              body: JSON.stringify({
                model: 'google/gemma-3-12b-it:free',
                messages: [
                  {
                    role: 'system',
                    content: 'You are a translator. Translate Korean text to English for search engines. Keep technical terms like "RxJS", "Angular", etc. unchanged.'
                  },
                  {
                    role: 'user',
                    content: sanitizedQuery
                  }
                ],
                max_tokens: 100,
                temperature: 0.3,
                response_format: {
                  type: "json_object",
                  schema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description: "The translated search query in English"
                      }
                    },
                    required: ["query"],
                    additionalProperties: false
                  }
                }
              }),
              signal: AbortSignal.timeout(5000)
            });
            
            if (translationResponse.ok) {
              const translationData = await translationResponse.json() as any;
              const translatedContent = translationData.choices?.[0]?.message?.content;
              
              if (translatedContent) {
                try {
                  // 🎯 Structured Output으로 깔끔한 JSON 파싱
                  const parsed = JSON.parse(translatedContent);
                  if (parsed.query && typeof parsed.query === 'string') {
                    englishQuery = sanitizeInput(parsed.query.trim());
                    secureLog('info', 'AI translation completed successfully');
                  } else {
                    secureLog('warn', 'Invalid translation response structure');
                  }
                } catch (parseError) {
                  secureLog('warn', 'Translation parsing failed, using fallback');
                  
                  // 🔧 Fallback: 따옴표 안의 텍스트 추출 시도
                  const quotedTextMatch = translatedContent.match(/"([^"]+)"/);
                  if (quotedTextMatch && quotedTextMatch[1]) {
                    const extracted = quotedTextMatch[1];
                    if (extracted.toLowerCase().includes('rxjs') || extracted.toLowerCase().includes('documentation')) {
                      try {
                        englishQuery = sanitizeInput(extracted);
                        secureLog('info', 'Fallback extraction successful');
                      } catch (sanitizeError) {
                        secureLog('warn', 'Fallback extraction failed sanitization');
                      }
                    }
                  }
                }
              }
            }
          } catch (translationError) {
            secureLog('warn', 'AI translation failed, using basic fallback');
          }
        }
        
        // Fallback: 기술 키워드만 추출
        if (englishQuery === sanitizedQuery && hasKorean) {
          const techKeywords = sanitizedQuery.match(/\b(rxjs|angular|react|vue|typescript|javascript|node|npm|webpack|babel|eslint|jest|cypress|docker|kubernetes|aws|git|github|vscode)\b/gi);
          if (techKeywords && techKeywords.length > 0) {
            englishQuery = `${techKeywords.join(' ')} documentation latest`;
          }
        }
        
        // 영어 검색 재시도
        if (englishQuery !== sanitizedQuery) {
          const englishParams = new URLSearchParams({
            q: encodeURIComponent(englishQuery.trim()),
            count: validatedMaxResults.toString(),
            search_lang: 'en',
            ui_lang: 'en-US',
            safesearch: 'strict',
            textDecorations: 'false'
          });
          
          // freshness 파라미터 재적용
          if (freshnessParam) {
            englishParams.set('freshness', freshnessParam);
          }
          
          const englishSearchUrl = `https://api.search.brave.com/res/v1/web/search?${englishParams}`;
          
          try {
            const englishResponse = await fetch(englishSearchUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': apiKey,
                'User-Agent': 'ChatH4O/1.0 (Korean Language Support)'
              },
              signal: AbortSignal.timeout(SECURITY_CONFIG.REQUEST_TIMEOUT)
            });
            
            if (englishResponse.ok) {
              const englishData = await englishResponse.json() as any;
              const englishResults: SearchResult[] = [];
              
              if (englishData.web && englishData.web.results && Array.isArray(englishData.web.results)) {
                for (const item of englishData.web.results.slice(0, validatedMaxResults)) {
                  try {
                    const url = new URL(item.url);
                    englishResults.push({
                      title: sanitizeOutput(item.title || 'No title'),
                      url: item.url || '',
                      snippet: sanitizeOutput(item.description || 'No description available'),
                      source: 'Brave Search (AI Translation)',
                      domain: url.hostname,
                      published: item.age || undefined,
                      relevanceScore: item.score || undefined
                    });
                  } catch (urlError) {
                    continue; // 유효하지 않은 URL은 건너뛰기
                  }
                }
              }
              
              if (englishResults.length > 0) {
                secureLog('info', 'AI translation retry successful');
                return {
                  success: true,
                  data: {
                    query: `${sanitizedQuery} (번역됨)`,
                    results: englishResults,
                    timestamp: new Date().toISOString(),
                    source: 'Brave Search API (AI Translation)',
                    searchTime: Date.now() - searchStartTime,
                    totalResults: englishResults.length
                  }
                };
              }
            }
          } catch (retryError) {
            secureLog('warn', 'AI translation retry failed');
          }
        }
      }
      
      return {
        success: false,
        error: `검색 결과를 찾을 수 없습니다. 다른 검색어를 시도해보시거나 더 구체적인 키워드를 사용해보세요.`,
        data: {
          query: sanitizedQuery,
          results: [],
          timestamp: new Date().toISOString(),
          source: 'Brave Search API',
          searchTime,
          totalResults: 0
        }
      };
    }

    return {
      success: true,
      data: {
        query: sanitizedQuery,
        results,
        timestamp: new Date().toISOString(),
        source: 'Brave Search API',
        searchTime,
        totalResults: results.length
      }
    };

  } catch (error) {
    // 타임아웃이나 네트워크 오류 처리
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        secureLog('warn', 'Search request timeout');
        return {
          success: false,
          error: '검색 요청이 시간 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.',
          data: {
            query: query.substring(0, 50),
            results: [],
            timestamp: new Date().toISOString(),
            source: 'Timeout Error'
          }
        };
      }
    }

    secureLog('error', 'Web search error', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      success: false,
      error: `웹 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
      data: {
        query: query.substring(0, 50),
        results: [],
        timestamp: new Date().toISOString(),
        source: 'Error'
      }
    };
  }
}

/**
 * 웹 검색 및 AI 요약 도구 - Brave Search API Summarizer 사용
 * 
 * 검색 결과를 AI가 요약하여 제공합니다.
 * - 1단계: summary=1 파라미터로 검색 → summarizer 키 획득
 * - 2단계: summarizer 엔드포인트에서 AI 요약 결과 가져오기
 */
export async function searchAndSummarize(query: string, env?: any): Promise<ToolResult<SummaryResult>> {
  try {
    // 입력 검증 및 새니타이징
    let sanitizedQuery: string;
    try {
      sanitizedQuery = sanitizeInput(query);
    } catch (error) {
      secureLog('warn', 'Invalid summarize query input', { error: error instanceof Error ? error.message : 'Unknown' });
      return {
        success: false,
        error: '검색어가 유효하지 않습니다. 특수 문자를 제거하고 다시 시도해주세요.',
        data: {
          summary: '',
          sources: [],
          query: query.substring(0, 50) + '...',
          timestamp: new Date().toISOString(),
          source: 'Input Validation Error'
        }
      };
    }
    
    // Rate limiting 체크
    const clientId = env?.CF_RAY || 'default';
    if (!checkRateLimit(`summarize_${clientId}`, 10, 60000)) { // 분당 10회 제한 (요약은 더 비싼 작업)
      secureLog('warn', 'Rate limit exceeded for summarize', { clientId: clientId.substring(0, 8) });
      return {
        success: false,
        error: '요약 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Rate Limit Error'
        }
      };
    }
    
    // 환경변수에서 API 키 확인
    const apiKey = env?.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
    
    if (!apiKey) {
      secureLog('error', 'Missing API key for summarize');
      return {
        success: false,
        error: 'Summarize service is temporarily unavailable. Please try again later.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Configuration Error'
        }
      };
    }

    // 1단계: 웹 검색으로 summarizer 키 획득
    const searchParams = new URLSearchParams({
      q: encodeURIComponent(sanitizedQuery.trim()),
      summary: '1', // 요약 기능 활성화
      count: '10',
      search_lang: 'en', // 영어 검색 (기본)
      ui_lang: 'en-US', // 영어 UI
      safesearch: 'strict', // 보안상 strict 모드
      freshness: 'pw',
      textDecorations: 'false',
      textFormat: 'Raw'
    });
    
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?${searchParams}`;
    
    // URL 검증
    if (!isValidApiUrl(searchUrl, SECURITY_CONFIG.ALLOWED_DOMAINS)) {
      secureLog('error', 'Invalid summarize search URL');
      return {
        success: false,
        error: 'Summarize service error. Please contact support.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'URL Validation Error'
        }
      };
    }
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'ChatH4O/1.0 (Korean Language Support)'
      },
      signal: AbortSignal.timeout(SECURITY_CONFIG.REQUEST_TIMEOUT)
    });

    if (!searchResponse.ok) {
      secureLog('warn', 'Brave Search API error in summarize', { status: searchResponse.status });
      return {
        success: false,
        error: `요약 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.`,
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Brave Search API Error'
        }
      };
    }

    const searchData = await searchResponse.json() as any;
    
    // summarizer 키 확인
    if (!searchData.summarizer?.key) {
      return {
        success: false,
        error: `요약을 생성할 수 없습니다. 일반 검색 결과만 이용 가능합니다.`,
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'No Summarizer Key'
        }
      };
    }

    // 2단계: Summarizer 엔드포인트에서 AI 요약 가져오기
    const summarizerKey = encodeURIComponent(searchData.summarizer.key);
    const summarizerUrl = `https://api.search.brave.com/res/v1/summarizer/search?key=${summarizerKey}&entity_info=1`;
    
    // URL 검증
    if (!isValidApiUrl(summarizerUrl, SECURITY_CONFIG.ALLOWED_DOMAINS)) {
      secureLog('error', 'Invalid summarizer URL');
      return {
        success: false,
        error: 'Summarize service error. Please contact support.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'URL Validation Error'
        }
      };
    }
    
    const summarizerResponse = await fetch(summarizerUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'ChatH4O/1.0'
      },
      signal: AbortSignal.timeout(SECURITY_CONFIG.SUMMARIZER_TIMEOUT) // 요약은 시간이 더 걸릴 수 있음
    });

    if (!summarizerResponse.ok) {
      secureLog('warn', 'Summarizer API error', { status: summarizerResponse.status });
      return {
        success: false,
        error: `요약 생성에 실패했습니다. 잠시 후 다시 시도해주세요.`,
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Summarizer API Error'
        }
      };
    }

    const summarizerData = await summarizerResponse.json() as any;
    
    // 요약 결과 파싱
    let summary = '';
    let sources: string[] = [];
    
    if (summarizerData.summary?.text) {
      summary = sanitizeOutput(summarizerData.summary.text);
    }
    
    // 소스 링크 수집 및 검증
    if (summarizerData.summary?.sources && Array.isArray(summarizerData.summary.sources)) {
      sources = summarizerData.summary.sources
        .map((source: any) => source.url || source.link)
        .filter((url: string) => {
          if (!url) return false;
          try {
            new URL(url); // URL 유효성 검증
            return true;
          } catch {
            return false;
          }
        })
        .slice(0, 5); // 최대 5개 소스
    }

    if (!summary) {
      return {
        success: false,
        error: `요약을 생성할 수 없습니다.`,
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Empty Summary'
        }
      };
    }

    return {
      success: true,
      data: {
        summary,
        sources,
        query: sanitizedQuery,
        timestamp: new Date().toISOString(),
        source: 'Brave Search Summarizer'
      }
    };

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      secureLog('warn', 'Summarize request timeout');
      return {
        success: false,
        error: '요약 요청이 시간 초과되었습니다.',
        data: {
          summary: '',
          sources: [],
          query: query.substring(0, 50),
          timestamp: new Date().toISOString(),
          source: 'Timeout Error'
        }
      };
    }

    secureLog('error', 'Summarize error', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      success: false,
      error: `요약 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
      data: {
        summary: '',
        sources: [],
        query: query.substring(0, 50),
        timestamp: new Date().toISOString(),
        source: 'Error'
      }
    };
  }
}

/**
 * 현재 시간 도구
 */
export function getCurrentTime(timezone?: string): ToolResult<{
  formatted: string;
  iso: string;
  timestamp: number;
  timezone: string;
}> {
  try {
    // 타임존 검증 (화이트리스트 방식)
    const allowedTimezones = [
      'Asia/Seoul', 'America/New_York', 'Europe/London', 'Asia/Tokyo',
      'America/Los_Angeles', 'Europe/Paris', 'Asia/Shanghai', 'UTC'
    ];
    
    const validTimezone = timezone && allowedTimezones.includes(timezone) ? timezone : 'Asia/Seoul';
    
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
      timeZone: validTimezone
    };

    const formattedTime = now.toLocaleString('ko-KR', options);
    const isoTime = now.toISOString();

    return {
      success: true,
      data: {
        formatted: formattedTime,
        iso: isoTime,
        timestamp: now.getTime(),
        timezone: validTimezone
      }
    };
  } catch (error) {
    secureLog('error', 'Time retrieval failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      success: false,
      error: `시간 조회에 실패했습니다.`
    };
  }
}

/**
 * 사용 가능한 모든 도구 정의 (OpenAI Function Calling 형식)
 * 🔧 한국어 깨짐 방지: 모든 description을 영어로 작성
 */
export const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'REQUIRED for ANY request about current events, latest news, recent updates, or time-sensitive information. Search the internet for real-time information. Always use this tool when users ask for "latest", "recent", "current", or specify dates/years. Do NOT provide outdated information from training data.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query in any language including Korean. Include specific dates, years, or time periods when relevant (e.g., "마비노기 모바일 2024년 소식" or "latest updates"). Required parameter.',
            minLength: 1,
            maxLength: 500
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of search results to return (default: 5, maximum: 10)',
            default: 5,
            minimum: 1,
            maximum: 10
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_and_summarize',
      description: 'REQUIRED for comprehensive current information requests. Search the internet and provide AI-generated summary of the results. Always use this tool when users want detailed, up-to-date information about topics. Do NOT rely on potentially outdated training data.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to summarize in any language including Korean. Include specific dates, years, or time periods when relevant. Write clearly and concretely. Required parameter.',
            minLength: 1,
            maxLength: 500
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Gets the current time and date. ALWAYS use this tool when you need to reference current date/time, provide context about when information is current, or when users ask about recent/latest information. This ensures accurate temporal context.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone identifier (e.g., Asia/Seoul, America/New_York, Europe/London). If omitted, Asia/Seoul will be used.',
            default: 'Asia/Seoul'
          }
        },
        required: [],
        additionalProperties: false
      }
    }
  }
];

/**
 * 도구 실행 매핑
 */
export const TOOL_FUNCTIONS = {
  search_web: searchWeb,
  search_and_summarize: searchAndSummarize,
  get_current_time: getCurrentTime,
};

/**
 * 도구 호출 실행기
 */
export async function executeTool<T>(toolName: string, args: any, env?: any): Promise<ToolResult<T>> {
  const toolFunction = TOOL_FUNCTIONS[toolName as keyof typeof TOOL_FUNCTIONS];
  
  if (!toolFunction) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`
    };
  }

  try {
    // 각 도구에 맞는 인자 처리
    switch (toolName) {
      case 'search_web':
        return await searchWeb(args.query, args.max_results, env) as ToolResult<T>;
      case 'search_and_summarize':
        return await searchAndSummarize(args.query, env) as ToolResult<T>;
      case 'get_current_time':
        return getCurrentTime(args.timezone) as ToolResult<T>;
      default:
        return {
          success: false,
          error: `Tool execution not implemented: ${toolName}`
        };
    }
  } catch (error) {
    return {
      success: false,
      error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
} 
