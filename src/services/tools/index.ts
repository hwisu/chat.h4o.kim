/**
 * Function Calling Tools Service
 * 모델이 사용할 수 있는 도구들을 정의하고 실행하는 서비스
 */

// 먼저 타입과 인터페이스 임포트
import type { ToolResult } from './common';

// 도구 함수들 임포트
import { searchWeb } from './search';
import { searchAndSummarize } from './summarize';
import { getCurrentTime } from './time';
import { translateText } from './translate';

// 공통 유틸리티 및 상수 내보내기
export * from './common';

// 개별 도구 함수들 내보내기
export { searchWeb } from './search';
export { searchAndSummarize } from './summarize';
export { getCurrentTime } from './time';
export { translateText } from './translate';

// 사용 가능한 모든 도구 정의 (OpenAI Function Calling 형식)
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
      description: 'Gets the current time and date in various timezones and formats. Use this tool to get accurate time information for different regions, compare times across timezones, or when specific timezone information is needed.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone identifier (e.g., Asia/Seoul, America/New_York, Europe/London, UTC). If omitted, Asia/Seoul will be used.',
            default: 'Asia/Seoul'
          },
          format: {
            type: 'string',
            description: 'Time format (full: complete date and time, date: date only, time: time only). If omitted, full will be used.',
            enum: ['full', 'date', 'time'],
            default: 'full'
          }
        },
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'translate_text',
      description: 'Translate text between different languages using DeepL API. Supports high-quality translation for various language pairs including Korean, English, Japanese, Chinese, and many European languages.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to translate. Required parameter.',
            minLength: 1,
            maxLength: 5000
          },
          target_language: {
            type: 'string',
            description: 'Target language code (e.g., EN for English, KO for Korean, JA for Japanese, ZH for Chinese, DE for German, FR for French, ES for Spanish, IT for Italian). Required parameter.',
            minLength: 2,
            maxLength: 2
          },
          source_language: {
            type: 'string',
            description: 'Source language code (optional, if not provided DeepL will auto-detect). Use same codes as target_language.',
            minLength: 2,
            maxLength: 2
          }
        },
        required: ['text', 'target_language'],
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
  translate_text: translateText,
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
        return getCurrentTime(args.timezone, args.format) as ToolResult<T>;
      case 'translate_text':
        return await translateText(args.text, args.target_language, args.source_language, env) as ToolResult<T>;
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
