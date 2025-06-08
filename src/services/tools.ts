/**
 * Function Calling Tools Service
 * 모델이 사용할 수 있는 도구들을 정의하고 실행하는 서비스
 */

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
    // 환경변수에서 API 키 확인 (Cloudflare Workers 환경 고려)
    const apiKey = env?.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'BRAVE_SEARCH_API_KEY 환경변수가 설정되지 않았습니다. https://api.search.brave.com 에서 무료 API 키를 발급받아 설정해주세요.',
        data: {
          query,
          results: [],
          timestamp: new Date().toISOString(),
          source: 'Configuration Error'
        }
      };
    }

    // 검색 시작 시간 기록
    const searchStartTime = Date.now();

    // Brave Search API 사용 (더 나은 파라미터 설정)
    const params = new URLSearchParams({
      q: query.trim(),
      count: Math.min(maxResults, 10).toString(), // 최대 10개로 제한
    });
    
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?${params}`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'ChatH4O/1.0'
      },
      signal: AbortSignal.timeout(10000) // 10초 타임아웃
    });

    const searchTime = Date.now() - searchStartTime;

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `Brave Search API 오류: HTTP ${response.status}. ${response.status === 429 ? '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' : response.status === 401 ? 'API 키가 유효하지 않습니다.' : '검색 서비스에 문제가 발생했습니다.'}`,
        data: {
          query,
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
      for (const item of data.web.results.slice(0, maxResults)) {
        const url = new URL(item.url);
        results.push({
          title: item.title || 'No title',
          url: item.url || '',
          snippet: item.description || 'No description available',
          source: 'Brave Search',
          domain: url.hostname,
          published: item.age || undefined,
          relevanceScore: item.score || undefined
        });
      }
  }
  
    // 결과가 없는 경우 더 자세한 안내
    if (results.length === 0) {
      return {
        success: false,
        error: `"${query}"에 대한 검색 결과를 찾을 수 없습니다. 다른 검색어를 시도해보시거나 더 구체적인 키워드를 사용해보세요.`,
        data: {
          query,
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
        query,
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
        return {
          success: false,
          error: '검색 요청이 시간 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.',
          data: {
            query,
            results: [],
            timestamp: new Date().toISOString(),
            source: 'Timeout Error'
          }
        };
      }
    }

    return {
      success: false,
      error: `웹 검색 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}. 잠시 후 다시 시도해주세요.`,
      data: {
        query,
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
    // 환경변수에서 API 키 확인
    const apiKey = env?.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'BRAVE_SEARCH_API_KEY 환경변수가 설정되지 않았습니다. https://api.search.brave.com 에서 무료 API 키를 발급받아 설정해주세요.',
        data: {
          summary: '',
          sources: [],
          query,
          timestamp: new Date().toISOString(),
          source: 'Configuration Error'
        }
      };
    }

    // 1단계: 웹 검색으로 summarizer 키 획득
    const searchParams = new URLSearchParams({
      q: query.trim(),
      summary: '1', // 요약 기능 활성화
      count: '10',
      mkt: 'ko-KR',
      safesearch: 'moderate',
      freshness: 'pw',
      textDecorations: 'false',
      textFormat: 'Raw'
    });
    
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?${searchParams}`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'ChatH4O/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!searchResponse.ok) {
      return {
        success: false,
        error: `Brave Search API 오류: HTTP ${searchResponse.status}`,
        data: {
          summary: '',
          sources: [],
          query,
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
        error: `"${query}"에 대한 요약을 생성할 수 없습니다. 일반 검색 결과만 이용 가능합니다.`,
        data: {
          summary: '',
          sources: [],
          query,
          timestamp: new Date().toISOString(),
          source: 'No Summarizer Key'
        }
      };
    }

    // 2단계: Summarizer 엔드포인트에서 AI 요약 가져오기
    const summarizerKey = encodeURIComponent(searchData.summarizer.key);
    const summarizerUrl = `https://api.search.brave.com/res/v1/summarizer/search?key=${summarizerKey}&entity_info=1`;
    
    const summarizerResponse = await fetch(summarizerUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'ChatH4O/1.0'
      },
      signal: AbortSignal.timeout(15000) // 요약은 시간이 더 걸릴 수 있음
    });

    if (!summarizerResponse.ok) {
      return {
        success: false,
        error: `요약 생성 실패: HTTP ${summarizerResponse.status}`,
        data: {
          summary: '',
          sources: [],
          query,
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
      summary = summarizerData.summary.text;
    }
    
    // 소스 링크 수집
    if (summarizerData.summary?.sources && Array.isArray(summarizerData.summary.sources)) {
      sources = summarizerData.summary.sources
        .map((source: any) => source.url || source.link)
        .filter((url: string) => url)
        .slice(0, 5); // 최대 5개 소스
    }

    if (!summary) {
      return {
        success: false,
        error: `"${query}"에 대한 요약을 생성할 수 없습니다.`,
        data: {
          summary: '',
          sources: [],
          query,
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
        query,
        timestamp: new Date().toISOString(),
        source: 'Brave Search Summarizer'
      }
    };

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: '요약 요청이 시간 초과되었습니다.',
        data: {
          summary: '',
          sources: [],
          query,
          timestamp: new Date().toISOString(),
          source: 'Timeout Error'
        }
      };
    }

    return {
      success: false,
      error: `요약 생성 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      data: {
        summary: '',
        sources: [],
        query,
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
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    };

    if (timezone) {
      options.timeZone = timezone;
    }

    const formattedTime = now.toLocaleString('ko-KR', options);
    const isoTime = now.toISOString();

    return {
      success: true,
      data: {
        formatted: formattedTime,
        iso: isoTime,
        timestamp: now.getTime(),
        timezone: timezone || 'local'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Time retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 사용 가능한 모든 도구 정의 (OpenAI Function Calling 형식)
 */
export const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '인터넷에서 정보를 검색합니다. 최신 정보, 뉴스, 사실 확인 등에 유용합니다.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '검색할 쿼리. 구체적이고 명확한 검색어를 사용하세요.'
          },
          max_results: {
            type: 'number',
            description: '반환할 최대 검색 결과 수 (기본값: 5, 최대: 10)',
            default: 5,
            minimum: 1,
            maximum: 10
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_and_summarize',
      description: '인터넷에서 정보를 검색하고 AI가 요약한 결과를 제공합니다. 복잡한 주제나 여러 정보를 종합적으로 이해하고 싶을 때 유용합니다.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '검색하고 요약할 주제나 질문. 명확하고 구체적으로 작성하세요.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '현재 시간을 가져옵니다. 시간대 지정 가능합니다.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '시간대 (예: Asia/Seoul, America/New_York). 생략하면 로컬 시간 사용.'
          }
        },
        required: []
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
