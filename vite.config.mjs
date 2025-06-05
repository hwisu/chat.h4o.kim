import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import svelteConfig from './svelte.config.mjs';

export default defineConfig({
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
            if (id.includes('Modal.svelte')) {
              return 'modals';
            }
            return 'components';
          }
          
          if (id.includes('/services/') || id.includes('/stores/')) {
            return 'services';
          }
        }
      }
    },
    copyPublicDir: false,
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 500
  },
  optimizeDeps: {
    include: ['highlight.js', 'marked']
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
}); 
