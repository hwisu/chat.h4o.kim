/**
 * DeepL Translation Service
 * DeepL API를 사용한 번역 서비스
 */

import type { ToolResult } from './common';
import { sanitizeInput, sanitizeOutput, secureLog, isValidApiUrl, SECURITY_CONFIG } from './common';

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  timestamp: string;
}

// DeepL API 응답 타입 정의
interface DeepLTranslation {
  detected_source_language: string;
  text: string;
}

interface DeepLResponse {
  translations: DeepLTranslation[];
}

/**
 * DeepL API를 사용한 번역
 */
async function translateWithDeepL(
  text: string,
  targetLang: string,
  sourceLang?: string,
  apiKey?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('DeepL API key is required');
  }

  const url = 'https://api-free.deepl.com/v2/translate';

  // URL 검증
  if (!isValidApiUrl(url, ['api-free.deepl.com'])) {
    throw new Error('Invalid DeepL API URL');
  }

  const body = new URLSearchParams({
    text: text,
    target_lang: targetLang.toUpperCase(),
    preserve_formatting: '1',
    formality: 'default'
  });

  if (sourceLang) {
    body.append('source_lang', sourceLang.toUpperCase());
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ChatH4O/1.0 Translation Service'
    },
    body: body.toString(),
    signal: AbortSignal.timeout(SECURITY_CONFIG.REQUEST_TIMEOUT)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`DeepL API error (${response.status}): ${errorText}`);
  }

      const data = await response.json() as DeepLResponse;

  if (!data.translations || !Array.isArray(data.translations) || data.translations.length === 0) {
    throw new Error('Invalid DeepL API response');
  }

  return data.translations[0].text;
}

/**
 * 일반 번역 기능
 * 다양한 언어 간 번역을 제공
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string,
  env?: any
): Promise<ToolResult<TranslationResult>> {
  try {
    const sanitizedText = sanitizeInput(text);
    if (!sanitizedText.trim()) {
      return {
        success: false,
        error: 'Text to translate is required and cannot be empty'
      };
    }

    secureLog('info', `Translation request: ${sanitizedText.slice(0, 50)}...`);

    // DeepL API 키 가져오기
    const deeplApiKey = env?.DEEPL_API_KEY || process.env.DEEPL_API_KEY;

    if (!deeplApiKey) {
      return {
        success: false,
        error: 'DeepL API key not configured. Please set DEEPL_API_KEY environment variable.'
      };
    }

    const translatedText = await translateWithDeepL(
      sanitizedText,
      targetLang,
      sourceLang,
      deeplApiKey
    );

    secureLog('info', 'Translation completed successfully');

    return {
      success: true,
      data: {
        originalText: sanitizedText,
        translatedText: sanitizeOutput(translatedText),
        sourceLanguage: sourceLang || 'auto-detected',
        targetLanguage: targetLang.toUpperCase(),
        provider: 'DeepL',
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    secureLog('error', `Translation failed: ${error}`);
    return {
      success: false,
      error: `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 한국어를 영어로 번역 (검색 쿼리 최적화용)
 * 검색 전 쿼리 변경에 사용되는 특화된 번역 함수
 */
export async function translateKoreanToEnglish(
  koreanText: string,
  env?: any
): Promise<string> {
  try {
    const sanitizedText = sanitizeInput(koreanText);
    if (!sanitizedText.trim()) {
      return koreanText;
    }

    // 한국어가 포함되어 있는지 확인
    const hasKorean = /[가-힣]/.test(sanitizedText);
    if (!hasKorean) {
      return sanitizedText; // 한국어가 없으면 원본 반환
    }

    secureLog('info', `Korean to English translation for search query`);

    // DeepL API 키 가져오기
    const deeplApiKey = env?.DEEPL_API_KEY || process.env.DEEPL_API_KEY;

    if (!deeplApiKey) {
      secureLog('warn', 'DeepL API key not available, keeping original text');
      return koreanText;
    }

    const translatedText = await translateWithDeepL(
      sanitizedText,
      'EN',
      'KO',
      deeplApiKey
    );

    secureLog('info', 'Korean to English translation completed successfully');
    return sanitizeInput(translatedText);

  } catch (error) {
    secureLog('warn', `Korean to English translation failed: ${error}`);
    // 번역 실패 시 원본 텍스트 반환
    return koreanText;
  }
}
