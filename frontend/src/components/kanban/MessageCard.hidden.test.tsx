import { act, render, screen, waitFor } from '@testing-library/react'
import { AnimatePresence } from 'framer-motion'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Simula uma aba oculta: o navegador pausa o requestAnimationFrame e o framer-motion não
// consegue concluir animações. Precisa vir antes de qualquer import do framer-motion.
vi.hoisted(() => {
  globalThis.requestAnimationFrame = () => 0
  globalThis.cancelAnimationFrame = () => {}
})

import type { Message } from '@/lib/schemas'
import { MessageCard } from './MessageCard'

const msg: Message = {
  id: 'm1', customerName: 'Fantasma', rawContent: 'x', assignedSector: 'STOCK', sentiment: 'CALM',
  urgencyScore: 0.2, confidenceScore: 0.9, summary: 'resumo', suggestedAction: 'acao',
  correctedSector: null, status: 'COMPLETED', createdAt: '2026-01-01T00:00:00Z', processedAt: null, resolvedAt: null,
}

function Column({ items }: { items: Message[] }) {
  return (
    <ul>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((m) => (
          <MessageCard key={m.id} message={m} onOpen={() => {}} />
        ))}
      </AnimatePresence>
    </ul>
  )
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

afterEach(() => setHidden(false))

describe('card removido com a aba oculta', () => {
  it('some do DOM na hora, sem esperar a animação de saída', async () => {
    setHidden(true)
    const { rerender } = render(<Column items={[msg]} />)
    expect(screen.getByText('Fantasma')).toBeInTheDocument()

    rerender(<Column items={[]} />)
    await waitFor(() => expect(screen.queryByText('Fantasma')).not.toBeInTheDocument(), { timeout: 1000 })
  })

  it('controle: com a aba visível e o rAF parado, a animação de saída segura o card (a causa do fantasma)', async () => {
    setHidden(false)
    const { rerender } = render(<Column items={[msg]} />)
    rerender(<Column items={[]} />)
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByText('Fantasma')).toBeInTheDocument()
  })
})
