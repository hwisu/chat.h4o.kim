import { mount } from 'svelte';
import App from './App.svelte';

try {
  // Svelte 5 mount 함수 사용
  const app = mount(App, {
    target: document.getElementById('svelte-app'),
    props: {}
  });

  // 기존 JavaScript 코드에서 접근할 수 있도록 전역 변수로 노출
  window.svelteApp = app;
} catch (error) {
  console.error('Failed to mount Svelte app:', error);
  // DOM에도 에러 표시
  const target = document.getElementById('svelte-app');
  if (target) {
    target.innerHTML = `<div style="color: red; padding: 20px;">
      <h3>Svelte App Error</h3>
      <p>${error.message}</p>
      <pre>${error.stack}</pre>
    </div>`;
  }
}

export default null; 
