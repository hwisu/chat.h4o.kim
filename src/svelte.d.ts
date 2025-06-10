// Svelte 5 runes declarations
declare global {
  const $state: <T>(initialValue: T) => T;
  const $derived: <T>(fn: () => T) => T;
  const $effect: (fn: () => void | (() => void)) => void;
  const $props: <T>() => T;
}

export {};
