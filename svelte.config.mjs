import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    dev: process.env.NODE_ENV !== 'production',
    runes: true
  }
};

export default config; 
