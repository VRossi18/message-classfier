import { AnimatePresence, LayoutGroup } from 'framer-motion'
import { useRef } from 'react'
import { VSCROLL_ATTR, useWheelHorizontalScroll } from '@/hooks/useWheelHorizontalScroll'
import { COLUMNS, columnFor } from '@/lib/sectors'
import { cn } from '@/lib/utils'
import type { Message } from '@/lib/schemas'
import { MessageCard } from './MessageCard'

export function KanbanBoard({ messages, onOpen }: { messages: Message[]; onOpen: (id: string) => void }) {
  // Mensagens ainda não classificadas ficam na coluna de entrada.
  const intake = messages.filter((m) => columnFor(m) === null)
  const boardRef = useRef<HTMLDivElement>(null)
  useWheelHorizontalScroll(boardRef) // roda do mouse percorre as colunas na horizontal

  return (
    <LayoutGroup>
      {/* Região live curta: anunciar o quadro inteiro faria o leitor de tela repetir colunas. */}
      <p role="status" className="sr-only">
        {messages.length} mensagens no quadro
      </p>
      <div ref={boardRef} className="flex gap-4 overflow-x-auto pb-4">
        <Column title="Em triagem" accent="bg-slate-400" count={intake.length}>
          {intake.map((m) => (
            <MessageCard key={m.id} message={m} onOpen={onOpen} />
          ))}
        </Column>
        {COLUMNS.map((col) => {
          const items = messages.filter((m) => columnFor(m) === col.id)
          return (
            <Column key={col.id} title={col.label} accent={col.accent} count={items.length}>
              {items.map((m) => (
                <MessageCard key={m.id} message={m} onOpen={onOpen} />
              ))}
            </Column>
          )
        })}
      </div>
    </LayoutGroup>
  )
}

function Column({
  title,
  accent,
  count,
  children,
}: {
  title: string
  accent: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-bg/60 p-3">
      <header className="mb-3 flex items-center gap-2">
        <span className={cn('size-2.5 rounded-full', accent)} />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto rounded-full bg-border px-2 text-xs text-muted">{count}</span>
      </header>
      {/* Cada coluna rola sozinha na vertical; assim a roda do mouse fica livre para o quadro. */}
      <ul
        {...{ [VSCROLL_ATTR]: '' }}
        className="m-0 flex max-h-[calc(100dvh-18rem)] min-h-24 flex-col gap-2 overflow-y-auto p-0 pr-1"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {children}
        </AnimatePresence>
        {count === 0 && <li className="list-none py-6 text-center text-xs text-muted">Nenhuma mensagem</li>}
      </ul>
    </section>
  )
}
