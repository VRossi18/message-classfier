import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/**
 * `false` enquanto a aba está oculta. Navegadores pausam o requestAnimationFrame nesse estado,
 * então animações de saída nunca terminam e deixam cards-fantasma no DOM.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !document.hidden,
    () => true,
  )
}
