import { useEffect, type RefObject } from 'react'

/** Marca uma lista que rola na vertical sozinha: a roda do mouse dentro dela continua vertical. */
export const VSCROLL_ATTR = 'data-vscroll'

/**
 * Decide se o gesto da roda deve virar rolagem horizontal. Devolve o deslocamento em px
 * ou null para deixar o navegador seguir o comportamento nativo.
 */
export function horizontalDelta(el: HTMLElement, e: WheelEvent): number | null {
  if (e.ctrlKey || e.defaultPrevented) return null // zoom por pinça / atalhos
  const max = el.scrollWidth - el.clientWidth
  if (max <= 0) return null // nada para rolar na horizontal

  // Dentro de uma lista com rolagem vertical própria, a roda rola a lista (até o fim dela).
  const list = (e.target as Element | null)?.closest?.(`[${VSCROLL_ATTR}]`)
  if (list instanceof HTMLElement && el.contains(list) && e.deltaY !== 0) {
    const down = e.deltaY > 0
    const canScroll = down ? list.scrollTop + list.clientHeight < list.scrollHeight - 1 : list.scrollTop > 0
    if (list.scrollHeight > list.clientHeight && canScroll) return null
  }

  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (delta === 0) return null
  // Nas pontas, deixa a página rolar em vez de prender o usuário no quadro.
  if (delta < 0 && el.scrollLeft <= 0) return null
  if (delta > 0 && el.scrollLeft >= max - 1) return null
  return e.deltaMode === 1 ? delta * 32 : delta // deltaMode 1 = linhas
}

/** Faz a roda do mouse rolar o elemento na horizontal (quadro Kanban). */
export function useWheelHorizontalScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Listener nativo e não passivo: o onWheel do React é passivo e não pode chamar preventDefault.
    const onWheel = (e: WheelEvent) => {
      const delta = horizontalDelta(el, e)
      if (delta === null) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])
}
