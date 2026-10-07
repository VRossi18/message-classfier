import { render } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { VSCROLL_ATTR, useWheelHorizontalScroll } from './useWheelHorizontalScroll'

function Board() {
  const ref = useRef<HTMLDivElement>(null)
  useWheelHorizontalScroll(ref)
  return (
    <div ref={ref} data-testid="board">
      <div data-testid="gap" />
      <ul {...{ [VSCROLL_ATTR]: '' }} data-testid="list" />
    </div>
  )
}

function setup(layout: { scrollWidth?: number; clientWidth?: number; scrollLeft?: number } = {}) {
  const { getByTestId, unmount } = render(<Board />)
  const board = getByTestId('board')
  Object.defineProperty(board, 'scrollWidth', { value: layout.scrollWidth ?? 2000, configurable: true })
  Object.defineProperty(board, 'clientWidth', { value: layout.clientWidth ?? 1000, configurable: true })
  board.scrollLeft = layout.scrollLeft ?? 0
  return { board, gap: getByTestId('gap'), list: getByTestId('list'), unmount }
}

const wheel = (target: Element, init: WheelEventInit) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

describe('useWheelHorizontalScroll', () => {
  it('converte a roda vertical em rolagem horizontal e cancela o scroll da página', () => {
    const { board, gap } = setup()
    const e = wheel(gap, { deltaY: 120 })
    expect(e.defaultPrevented).toBe(true)
    expect(board.scrollLeft).toBe(120)
    wheel(gap, { deltaY: -50 })
    expect(board.scrollLeft).toBe(70)
  })

  it('usa deltaX quando o gesto já é horizontal (trackpad)', () => {
    const { board, gap } = setup()
    wheel(gap, { deltaX: 80, deltaY: 5 })
    expect(board.scrollLeft).toBe(80)
  })

  it('multiplica por linha quando deltaMode é 1', () => {
    const { board, gap } = setup()
    wheel(gap, { deltaY: 3, deltaMode: 1 })
    expect(board.scrollLeft).toBe(96)
  })

  it('nas pontas deixa a página rolar normalmente', () => {
    const start = setup({ scrollLeft: 0 })
    expect(wheel(start.gap, { deltaY: -100 }).defaultPrevented).toBe(false)
    start.unmount()

    const end = setup({ scrollLeft: 1000 }) // máximo = 2000 - 1000
    expect(wheel(end.gap, { deltaY: 100 }).defaultPrevented).toBe(false)
  })

  it('não interfere quando não há o que rolar na horizontal', () => {
    const { board, gap } = setup({ scrollWidth: 800, clientWidth: 800 })
    expect(wheel(gap, { deltaY: 100 }).defaultPrevented).toBe(false)
    expect(board.scrollLeft).toBe(0)
  })

  it('ignora Ctrl+roda (zoom)', () => {
    const { gap } = setup()
    expect(wheel(gap, { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false)
  })

  it('dentro de uma lista com rolagem vertical própria, a roda rola a lista', () => {
    const { board, list } = setup()
    Object.defineProperty(list, 'scrollHeight', { value: 900, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true })
    list.scrollTop = 100

    expect(wheel(list, { deltaY: 100 }).defaultPrevented).toBe(false)
    expect(board.scrollLeft).toBe(0)

    // no fim da lista a roda volta a mover o quadro
    list.scrollTop = 500
    expect(wheel(list, { deltaY: 100 }).defaultPrevented).toBe(true)
    expect(board.scrollLeft).toBe(100)
  })

  it('lista sem overflow não captura a roda', () => {
    const { board, list } = setup()
    Object.defineProperty(list, 'scrollHeight', { value: 300, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true })
    wheel(list, { deltaY: 60 })
    expect(board.scrollLeft).toBe(60)
  })

  it('remove o listener ao desmontar', () => {
    const { board, gap, unmount } = setup()
    expect(wheel(gap, { deltaY: 10 }).defaultPrevented).toBe(true)
    unmount()
    expect(wheel(gap, { deltaY: 10 }).defaultPrevented).toBe(false)
    expect(board.scrollLeft).toBe(10)
  })
})
