// 글로벌 타입 선언
declare global {
  // Svelte 5 runes
  var $state: <T>(initial: T) => T;
  var $derived: <T>(fn: () => T) => T;
  var $effect: (fn: () => void | (() => void)) => void;
  var $props: <T>() => T;
}

export {}; 
