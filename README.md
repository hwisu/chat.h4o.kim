# Terminal-Style Chat Interface with Svelte Integration

Terminal-style chat interface using OpenRouter free models with Korean language optimization.

## Features

- Terminal-style chat UI with markdown support
- OpenRouter API integration
- Korean language optimization
- Authentication support
- Role selection
- Model selection
- Context management
- Svelte integration for modern UI components
- Web search with Brave Search API
- High-quality translation with DeepL API
- Automatic Korean-to-English translation for search queries

## Svelte Integration

이 프로젝트는 점진적으로 Svelte를 도입하고 있습니다. 현재는 기존 바닐라 JavaScript 코드와 함께 Svelte 컴포넌트를 사용하는 하이브리드 방식으로 구현되어 있습니다.

### 통합 방식

1. 기존 바닐라 JS 코드는 그대로 유지하면서 Svelte 컴포넌트를 점진적으로 도입
2. 상태 관리는 기존 코드에서 수행하고, Svelte 컴포넌트에 전달
3. 향후 점진적으로 더 많은 UI 요소를 Svelte 컴포넌트로 마이그레이션 예정

### 개발 방법

```bash
# 백엔드 개발 서버 실행 (Cloudflare Workers)
npm run dev

# Svelte 개발 서버 실행 (Vite)
npm run svelte-dev

# 빌드
npm run build
```

## Project Structure

```
chat.h4o.kim
  ├── public/            # 정적 파일
  │   ├── css/           # CSS 파일
  │   ├── js/            # 바닐라 JavaScript 파일
  │   └── svelte/        # Svelte 빌드 결과물 (자동 생성)
  ├── schemas/           # 스키마 정의
  ├── scripts/           # 유틸리티 스크립트
  ├── src/
  │   ├── middleware/    # 미들웨어
  │   ├── routes/        # API 라우트
  │   ├── services/      # 서비스
  │   └── svelte/        # Svelte 소스 코드
  │       ├── components/  # Svelte 컴포넌트
  │       └── App.svelte   # 메인 Svelte 앱
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.js     # Vite 설정
  ├── svelte.config.js   # Svelte 설정
  └── wrangler.toml      # Cloudflare Workers 설정
```

## 향후 계획

1. 더 많은 UI 컴포넌트를 Svelte로 마이그레이션
2. 상태 관리를 Svelte 스토어로 이전
3. TypeScript 적용
4. 테스트 추가

## 환경 설정

### 필수 환경변수

```bash
# OpenRouter API 키 (필수)
OPENROUTER_API_KEY=your_openrouter_api_key

# 웹 검색 기능을 위한 Brave Search API 키 (선택사항)
BRAVE_SEARCH_API_KEY=your_brave_search_api_key

# DeepL 번역 API 키 (선택사항)
DEEPL_API_KEY=your_deepl_api_key
```

### Brave Search API 설정 (웹 검색 기능)

웹 검색 기능을 사용하려면 Brave Search API 키가 필요합니다.

1. **무료 API 키 발급**: https://api.search.brave.com 에서 회원가입
2. **무료 제한**: 월 2,000 쿼리, 1 QPS
3. **환경변수 설정**: `BRAVE_SEARCH_API_KEY=tvly-your_api_key`

설정하지 않으면 DuckDuckGo 폴백이 사용됩니다 (제한적).

### DeepL 번역 API 설정 (번역 기능)

고품질 번역 기능을 사용하려면 DeepL API 키가 필요합니다.

1. **무료 API 키 발급**: https://www.deepl.com/ko/pro-api 에서 회원가입
2. **무료 제한**: 월 500,000 문자
3. **환경변수 설정**: `DEEPL_API_KEY=your_deepl_api_key`

설정하지 않으면 번역 도구와 검색 쿼리 번역 기능이 제한됩니다.

### 개발 환경 설정

개발 시에는 `.dev.vars` 파일을 프로젝트 루트에 생성하여 환경변수를 설정하세요:

```bash
# .dev.vars 파일
OPENROUTER_API_KEY=your_openrouter_api_key
BRAVE_SEARCH_API_KEY=your_brave_search_api_key
DEEPL_API_KEY=your_deepl_api_key
```

## 개발 서버 실행

```bash
npm install
npm run dev
```

## 빌드 및 배포

```bash
npm run build
npm run deploy
```
