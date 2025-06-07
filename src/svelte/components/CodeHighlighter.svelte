<script lang="ts">
  import { onMount, tick } from 'svelte';
  // 모든 언어 지원으로 복구
  import hljs from 'highlight.js';
  import { marked } from 'marked';
  import 'highlight.js/styles/github-dark.css';

  interface Props {
    content?: string;
    role?: 'user' | 'assistant' | 'system';
  }

  let { content = '', role = 'assistant' }: Props = $props();

  let container: HTMLElement;
  let processedContent = $state('');

  // content prop 변화를 즉시 로그로 확인
  $effect(() => {
    // console.log('🔥 CONTENT CHANGED:', {
    //   length: content.length, 
    //   preview: content.substring(0, 100),
    //   hasCodeBlock: content.includes('```')
    // });
  });

  // HTML 이스케이프 함수
  function escapeHtml(text: string) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 코드 하이라이트 전담 함수
  function highlightCode(code: string, language?: string): string {
    // console.log('🎨 highlightCode called with:', { 
    //   codeLength: code.length, 
    //   language, 
    //   codePreview: code.substring(0, 50) + '...' 
    // });
    
    // console.log('✅ hljs available, available languages:', hljs.listLanguages?.() || 'listLanguages not available');

    try {
      if (language && hljs.getLanguage(language)) {
        // console.log(`🔍 Highlighting with specific language: ${language}`);
        const result = hljs.highlight(code.trim(), { language: language });
        // console.log('✅ Code highlighting successful for', language, 'result length:', result.value.length);
        // console.log('🎨 Highlighted result preview:', result.value.substring(0, 100) + '...');
        return result.value;
      } else {
        // console.log('🔍 Auto-detecting language...');
        const result = hljs.highlightAuto(code.trim());
        // console.log('✅ Auto-highlighting successful, detected language:', result.language, 'result length:', result.value.length);
        // console.log('🎨 Highlighted result preview:', result.value.substring(0, 100) + '...');
        return result.value;
      }
    } catch (err) {
      // console.warn('❌ Code highlighting failed:', err);
      return escapeHtml(code);
    }
  }

  // 마크다운 처리 함수
  function processMarkdown(text: string): string {
    // console.log('📝 processMarkdown called with text length:', text.length);
    // console.log('📝 Text preview:', text.substring(0, 200) + '...');
    
    if (!text) {
      // console.log('❌ No text provided');
      return '';
    }
    
    // console.log('🔍 Using npm packages: marked and hljs available');
    
    try {
      // 커스텀 renderer 생성
      const renderer = new marked.Renderer();
      
      // code 메서드 오버라이드
      renderer.code = function({ text, lang }: { text: string, lang?: string }) {
        // console.log('🔧 renderer.code called:', { 
        //   codeLength: text.length, 
        //   language: lang,
        //   codePreview: text.substring(0, 50) + '...'
        // });
        
        const highlightedCode = highlightCode(text, lang);
        // console.log('🔧 renderer.code result length:', highlightedCode.length);
        
        return `<pre><code class="language-${lang || 'text'} hljs">${highlightedCode}</code></pre>`;
      };
      
      // marked 설정
      marked.setOptions({
        breaks: true,
        gfm: true,
        renderer: renderer
      });
      
      const result = marked.parse(text) as string;
      // console.log('✅ Markdown parsing successful, result length:', result.length);
      // console.log('📝 Parsed result preview:', result.substring(0, 200) + '...');
      return result;
    } catch (err) {
      // console.warn('❌ Markdown parsing failed:', err);
      // console.log('🔄 Falling back to fallbackMarkdown');
      return fallbackMarkdown(text);
    }
  }

  // Fallback 마크다운 처리
  function fallbackMarkdown(text: string): string {
    // console.log('🔄 fallbackMarkdown called with text length:', text.length);
    
    const result = text
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        // console.log('🔄 fallback processing code block:', { 
        //   lang, 
        //   codeLength: code.length,
        //   codePreview: code.substring(0, 50) + '...'
        // });
        const highlightedCode = highlightCode(code, lang);
        // console.log('🔄 fallback highlighted code length:', highlightedCode.length);
        const blockResult = `<pre><code class="language-${lang || 'text'} hljs">${highlightedCode}</code></pre>`;
        // console.log('🔄 fallback block result length:', blockResult.length);
        return blockResult;
      })
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    
    // console.log('🔄 fallbackMarkdown result length:', result.length);
    // console.log('🔄 fallbackMarkdown result preview:', result.substring(0, 200) + '...');
    return result;
  }

  // 코드 블록 복사 기능
  function copyCodeBlock(event: Event) {
    const button = event.target as HTMLElement;
    const codeBlock = button.closest('.code-block-container')?.querySelector('code');
    if (codeBlock) {
      navigator.clipboard.writeText(codeBlock.textContent || '').then(() => {
        button.textContent = '✓';
        setTimeout(() => {
          button.textContent = 'copy';
        }, 1000);
      });
    }
  }

  // 복사 버튼 추가
  async function addCopyButtons() {
    await tick(); // DOM 업데이트 대기
    
    if (!container) return;

    const preElements = container.querySelectorAll('pre:not(.processed)');
    preElements.forEach((pre) => {
      const container_div = document.createElement('div');
      container_div.className = 'code-block-container';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-code-btn';
      copyBtn.textContent = 'copy';
      copyBtn.title = 'Copy code';
      copyBtn.addEventListener('click', copyCodeBlock);
      
      pre.parentNode?.insertBefore(container_div, pre);
      container_div.appendChild(copyBtn);
      container_div.appendChild(pre);
      pre.classList.add('processed');
    });
  }

  // 콘텐츠 처리 및 렌더링
  function processContent() {
    // console.log('🚀 processContent called with content length:', content.length);
    // console.log('🚀 Content preview:', content.substring(0, 100) + '...');
    
    processedContent = processMarkdown(content);
    
    // console.log('🚀 processContent finished, processedContent length:', processedContent.length);
    // console.log('🚀 ProcessedContent preview:', processedContent.substring(0, 200) + '...');
  }

  // 반응형 업데이트
  $effect(() => {
    if (content) {
      processContent();
    }
  });

  // DOM 업데이트 후 복사 버튼 추가
  $effect(() => {
    if (processedContent && container) {
      addCopyButtons();
    }
  });

  onMount(() => {
    processContent();
  });
</script>

<div bind:this={container} class="code-highlighter" class:user={role === 'user'} class:assistant={role === 'assistant'}>
  {@html processedContent}
</div>

<style>
  .code-highlighter {
    line-height: 1.6;
    font-size: 16px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  /* 기본 텍스트 색상 - role 기반 */
  .code-highlighter.user :global(p) {
    color: #E6C384; /* carpYellow - 사용자 텍스트 */
  }

  .code-highlighter.assistant :global(p) {
    color: #DCD7BA; /* fujiWhite - 어시스턴트 텍스트 */
  }

  .code-highlighter :global(p) {
    color: inherit;
  }

  /* 인라인 코드 */
  .code-highlighter :global(code:not(pre code)) {
    background: rgba(0, 0, 0, 0.4);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'MonoplexKRNerd', monospace;
    font-size: 15px;
    color: #7FB4CA !important; /* springBlue */
    border: 1px solid rgba(0, 255, 0, 0.2);
  }

  /* 코드 블록 */
  .code-highlighter :global(pre) {
    background: rgba(0, 0, 0, 0.6);
    border-radius: 8px;
    padding: 16px;
    margin: 12px 0;
    overflow-x: auto;
    border-left: 4px solid #00ff00;
    border: 1px solid rgba(0, 255, 0, 0.3);
    position: relative;
  }

  /* 코드 블록 내 코드 */
  .code-highlighter :global(pre code) {
    background: none !important;
    padding: 0 !important;
    font-family: 'MonoplexKRNerd', monospace;
    font-size: 15px;
    line-height: 1.5;
    color: #DCD7BA;
    border: none !important;
    display: block;
  }

  /* === KANAGAWA 테마 기반 HIGHLIGHT.JS 스타일 === */
  /* 중요도: !important로 다른 스타일이 덮어쓰지 못하도록 함 */
  
  /* 키워드 */
  .code-highlighter :global(.hljs-keyword) {
    color: #957FB8 !important; /* oniViolet */
    font-weight: bold !important;
  }

  /* 함수 */
  .code-highlighter :global(.hljs-function) {
    color: #7E9CD8 !important; /* crystalBlue */
    font-weight: 500 !important;
  }

  /* 함수/클래스 제목 */
  .code-highlighter :global(.hljs-title) {
    color: #7E9CD8 !important; /* crystalBlue */
    font-weight: 600 !important;
  }

  /* 문자열 */
  .code-highlighter :global(.hljs-string) {
    color: #98BB6C !important; /* springGreen */
  }

  /* 숫자 */
  .code-highlighter :global(.hljs-number) {
    color: #D27E99 !important; /* sakuraPink */
  }

  /* 주석 */
  .code-highlighter :global(.hljs-comment) {
    color: #727169 !important; /* fujiGray */
    font-style: italic !important;
  }

  /* 내장 함수 */
  .code-highlighter :global(.hljs-built_in) {
    color: #7FB4CA !important; /* springBlue */
  }

  /* 매개변수 */
  .code-highlighter :global(.hljs-params) {
    color: #E6C384 !important; /* carpYellow */
  }

  /* 타입 */
  .code-highlighter :global(.hljs-type) {
    color: #7AA89F !important; /* waveAqua2 */
  }

  /* 연산자 */
  .code-highlighter :global(.hljs-operator) {
    color: #C0A36E !important; /* boatYellow2 */
  }

  /* 변수 */
  .code-highlighter :global(.hljs-variable) {
    color: #E6C384 !important; /* carpYellow */
  }

  /* 상수 */
  .code-highlighter :global(.hljs-constant) {
    color: #FFA066 !important; /* surimiOrange */
  }

  /* 리터럴 */
  .code-highlighter :global(.hljs-literal) {
    color: #FFA066 !important; /* surimiOrange */
  }

  /* 정규표현식 */
  .code-highlighter :global(.hljs-regexp) {
    color: #C0A36E !important; /* boatYellow2 */
  }

  /* 속성 */
  .code-highlighter :global(.hljs-attr) {
    color: #E6C384 !important; /* carpYellow */
  }

  /* 독스트링 태그 */
  .code-highlighter :global(.hljs-doctag) {
    color: #7AA89F !important; /* waveAqua2 */
  }

  /* 인용구 */
  .code-highlighter :global(.hljs-quote) {
    color: #727169 !important; /* fujiGray */
    font-style: italic !important;
  }

  /* 섹션 헤더 */
  .code-highlighter :global(.hljs-section) {
    color: #E46876 !important; /* waveRed */
    font-weight: bold !important;
  }

  /* 문자열 대체 */
  .code-highlighter :global(.hljs-subst) {
    color: #DCD7BA !important; /* fujiWhite */
  }

  /* 태그 */
  .code-highlighter :global(.hljs-tag) {
    color: #E46876 !important; /* waveRed */
  }

  /* 이름 */
  .code-highlighter :global(.hljs-name) {
    color: #7E9CD8 !important; /* crystalBlue */
  }

  /* CSS 선택자 태그 */
  .code-highlighter :global(.hljs-selector-tag) {
    color: #E46876 !important; /* waveRed */
  }

  /* CSS 선택자 클래스 */
  .code-highlighter :global(.hljs-selector-class) {
    color: #7AA89F !important; /* waveAqua2 */
  }

  /* CSS 선택자 ID */
  .code-highlighter :global(.hljs-selector-id) {
    color: #7FB4CA !important; /* springBlue */
  }

  /* 구두점 */
  .code-highlighter :global(.hljs-punctuation) {
    color: #9CABCA !important; /* springViolet2 */
  }

  /* 삭제된 텍스트 */
  .code-highlighter :global(.hljs-deletion) {
    color: #E82424 !important; /* samuraiRed */
    background: #43242B !important; /* winterRed */
  }

  /* 추가된 텍스트 */
  .code-highlighter :global(.hljs-addition) {
    color: #76946A !important; /* autumnGreen */
    background: #2B3328 !important; /* winterGreen */
  }

  /* 메타 */
  .code-highlighter :global(.hljs-meta) {
    color: #938AA9 !important; /* springViolet1 */
  }

  /* 메타 키워드 */
  .code-highlighter :global(.hljs-meta-keyword) {
    color: #957FB8 !important; /* oniViolet */
  }

  /* 메타 문자열 */
  .code-highlighter :global(.hljs-meta-string) {
    color: #98BB6C !important; /* springGreen */
  }

  /* 마크다운 스타일 */
  .code-highlighter :global(strong) {
    font-weight: bold !important;
    color: #E6C384 !important; /* carpYellow */
  }

  .code-highlighter :global(em) {
    font-style: italic !important;
    color: #D27E99 !important; /* sakuraPink */
  }

  /* 리스트 */
  .code-highlighter :global(ol),
  .code-highlighter :global(ul) {
    margin: 8px 0;
    padding-left: 30px;
  }

  .code-highlighter :global(li) {
    margin: 4px 0;
    line-height: 1.6;
  }

  /* 스크롤바 */
  .code-highlighter :global(pre)::-webkit-scrollbar {
    height: 6px;
  }

  .code-highlighter :global(pre)::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  .code-highlighter :global(pre)::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
  }

  .code-highlighter :global(pre)::-webkit-scrollbar-thumb:hover {
    background: #555;
  }

  /* 코드 블록 컨테이너 */
  :global(.code-block-container) {
    position: relative;
    margin: 12px 0;
  }

  /* 복사 버튼 */
  :global(.copy-code-btn) {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    color: #ffffff;
    padding: 4px 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'MonoplexKRNerd', monospace;
    z-index: 10;
  }

  :global(.copy-code-btn:hover) {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
  }
</style> 
