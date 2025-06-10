/**
 * Web search tools using Brave Search API
 */

import {
  sanitizeInput,
  sanitizeOutput,
  isValidApiUrl,
  checkRateLimit,
  secureLog,
  SECURITY_CONFIG,
  ToolResult,
  SearchResult
} from './common';

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
    if (error instanceof Error && error.name === 'AbortError') {
      secureLog('warn', 'Search request timeout');
      return {
        success: false,
        error: '검색 요청이 시간 초과되었습니다.',
        data: {
          query: query.substring(0, 50),
          results: [],
          timestamp: new Date().toISOString(),
          source: 'Timeout Error'
        }
      };
    }

    secureLog('error', 'Search error', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      success: false,
      error: `검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
      data: {
        query: query.substring(0, 50),
        results: [],
        timestamp: new Date().toISOString(),
        source: 'Error'
      }
    };
  }
}
