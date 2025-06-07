import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import svelteConfig from './svelte.config.mjs';
import analyzer from 'rollup-plugin-analyzer';

export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production';
  
  return {
    base: '/svelte/',
    plugins: [svelte(svelteConfig)],
    build: {
      outDir: 'public/svelte',
      emptyOutDir: true,
      rollupOptions: {
        input: 'src/svelte/main.js',
        output: {
          entryFileNames: 'bundle.js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
          manualChunks(id) {
            // node_modules의 라이브러리들을 청크별로 분리
            if (id.includes('node_modules')) {
              if (id.includes('highlight.js')) {
                return 'highlight';
              }
              if (id.includes('marked')) {
                return 'marked';
              }
              if (id.includes('svelte')) {
                return 'svelte';
              }
              // 기타 node_modules는 vendor로 묶음
              return 'vendor';
            }
            
            // 소스 코드를 기능별로 분리
            if (id.includes('/components/')) {
              return 'components';
            }
            
            if (id.includes('/services/') || id.includes('/stores/')) {
              return 'services';
            }
          }
        },
        plugins: [
          // 프로덕션 빌드시에만 번들 분석 실행
          ...(isProduction ? [analyzer({ summaryOnly: true })] : [])
        ],
        // Tree shaking 활성화
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
          unknownGlobalSideEffects: false
        }
      },
      copyPublicDir: false,
      sourcemap: false,
      minify: 'esbuild',
      chunkSizeWarningLimit: 500,
      // 더 강력한 최적화 설정
      target: 'esnext',
      // 사용되지 않는 CSS 제거
      cssCodeSplit: true,
      cssMinify: true,
      // Rollup 옵션으로 dead code elimination 강화
      reportCompressedSize: true,
      // 압축 및 최적화 강화
      assetsInlineLimit: 4096,
      // esbuild 최적화 설정
      esbuild: {
        drop: isProduction ? ['console', 'debugger'] : [],
        legalComments: 'none',
        minifyIdentifiers: true,
        minifySyntax: true,
        minifyWhitespace: true,
        treeShaking: true,
        // 추가 최적화
        keepNames: false,
        // Terser와 유사한 최적화
        minify: true
      }
    },
    optimizeDeps: {
      include: ['marked'],
      exclude: ['highlight.js'] // 동적 로딩으로 변경
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true
        }
      }
    },
    // Tree shaking을 위한 추가 설정
    define: {
      // 프로덕션에서는 개발 관련 코드 제거
      __DEV__: !isProduction,
      'process.env.NODE_ENV': JSON.stringify(mode)
    },
    // 사용되지 않는 import 경고
    logLevel: isProduction ? 'warn' : 'info'
  };
}); 
