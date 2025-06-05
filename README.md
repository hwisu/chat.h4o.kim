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
