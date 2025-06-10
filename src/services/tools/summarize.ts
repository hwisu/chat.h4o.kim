/**
 * Search and summarize tools
 */

import {
  sanitizeInput,
  secureLog,
  checkRateLimit,
  isValidApiUrl,
  SECURITY_CONFIG,
  type ToolResult,
  type SummaryResult
} from './common';

import { searchWeb } from './search';

/**
 * 검색 결과를 바탕으로 요약 생성 도구
 */
export async function searchAndSummarize(query: string, env?: any): Promise<ToolResult<SummaryResult>> {
  try {
    // 검색어 검증 및 새니타이징
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
          query: query.substring(0, 50) + '...', // 로깅용으로 일부만
          timestamp: new Date().toISOString(),
          source: 'Input Validation Error'
        }
      };
    }

    // Rate limiting 체크
    const clientId = env?.CF_RAY || 'default';
    if (!checkRateLimit(`summarize_${clientId}`, 20, 60000)) { // 분당 20회 제한
      secureLog('warn', 'Rate limit exceeded for summarize', { clientId: clientId.substring(0, 8) });
      return {
        success: false,
        error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Rate Limit Error'
        }
      };
    }

    // 웹 검색 결과 가져오기 (더 많은 결과로)
    const searchResults = await searchWeb(sanitizedQuery, 10, env);

    if (!searchResults.success || !searchResults.data || searchResults.data.results.length === 0) {
      return {
        success: false,
        error: searchResults.error || '검색 결과가 없어 요약을 생성할 수 없습니다.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: searchResults.data?.source || 'Search Error'
        }
      };
    }

    // OpenRouter API 키 가져오기
    const apiKey = env?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      secureLog('error', 'Missing API key configuration for summarization');
      return {
        success: false,
        error: 'Summarization service is temporarily unavailable. Please try again later.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Configuration Error'
        }
      };
    }

    // 검색 결과에서 정보 추출
    const results = searchResults.data.results;

    // 요약 대상 컨텐츠 구성
    let contentToSummarize = `쿼리: ${sanitizedQuery}\n\n`;
    const sources: string[] = [];

    for (let i = 0; i < Math.min(results.length, 5); i++) {
      const result = results[i];
      contentToSummarize += `문서 ${i+1}:\n제목: ${result.title}\n내용: ${result.snippet}\n출처: ${result.url}\n\n`;
      sources.push(`${result.title} (${result.url})`);
    }

    // OpenRouter API를 통한 요약 생성
    const summarizationUrl = 'https://openrouter.ai/api/v1/chat/completions';

    // URL 검증
    if (!isValidApiUrl(summarizationUrl, SECURITY_CONFIG.ALLOWED_DOMAINS)) {
      secureLog('error', 'Invalid API URL detected for summarization');
      return {
        success: false,
        error: 'Summarization service error. Please contact support.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'URL Validation Error'
        }
      };
    }

    const summarizationResponse = await fetch(summarizationUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'ChatH4O Summarization Service'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-12b-it:free',  // 대안: anthropic/claude-3-haiku:alpha
        messages: [
          {
            role: 'system',
            content: `당신은 웹 검색 결과를 요약하는 도우미입니다.
제공된 내용을 정확하게 분석하고, 중요한 정보를 간결하게 요약해주세요.
요약 시 다음 사항을 지켜주세요:
1. 중요 정보만 포함시키고 중복을 제거하세요.
2. 사실을 왜곡하거나 없는 정보를 추가하지 마세요.
3. 쿼리와 관련 없는 내용은 제외하세요.
4. 제공된 정보만 사용하고 외부 지식을 추가하지 마세요.
5. 한국어로 자연스럽게 요약해주세요. 단, 영어 쿼리인 경우 영어로 요약해주세요.
6. 모든 날짜와 수치 정보는 정확하게 포함해주세요.
7. 중립적인 어조를 유지하세요.

출력 형식:
- 결과를 500-1000자 사이로 요약하세요.
- 여러 단락으로 구성하되, 중요한 정보는 첫 단락에 넣으세요.
- 내용이 부족하거나 관련성이 낮다면 "제공된 정보로는 충분한 요약을 제공할 수 없습니다"라고 명시하세요.`
          },
          {
            role: 'user',
            content: contentToSummarize
          }
        ],
        max_tokens: 1500,
        temperature: 0.3,
        top_p: 0.9
      }),
      signal: AbortSignal.timeout(SECURITY_CONFIG.SUMMARIZER_TIMEOUT)
    });

    if (!summarizationResponse.ok) {
      secureLog('warn', 'OpenRouter API error during summarization', { status: summarizationResponse.status });
      return {
        success: false,
        error: summarizationResponse.status === 429
          ? '요약 서비스 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
          : '요약 생성 중 오류가 발생했습니다.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'OpenRouter API Error'
        }
      };
    }

    const summarizationData = await summarizationResponse.json() as any;
    const summary = summarizationData.choices?.[0]?.message?.content || '';

    if (!summary) {
      return {
        success: false,
        error: '요약 생성에 실패했습니다.',
        data: {
          summary: '',
          sources: [],
          query: sanitizedQuery,
          timestamp: new Date().toISOString(),
          source: 'Empty Summary Error'
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
        source: 'OpenRouter API'
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
