import { Moon, Radio, Send, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast, Toaster } from 'sonner'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { MessageDetailDialog } from '@/components/message/MessageDetailDialog'
import { MetricsPanel } from '@/components/metrics/MetricsPanel'
import { PlaygroundPanel } from '@/components/playground/PlaygroundPanel'
import { Button } from '@/components/ui/button'
import { useMessages, useResolveMessage } from '@/hooks/useMessages'
import { useRealtime } from '@/hooks/useRealtime'

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return (localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'
    } catch {
      return false
    }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    } catch {
      /* armazenamento indisponível */
    }
  }, [dark])
  return { dark, toggle: () => setDark((d) => !d) }
}

export default function App() {
  const { data: messages = [], isLoading, isError, refetch } = useMessages()
  const { connected } = useRealtime()
  const { dark, toggle } = useTheme()
  const [openId, setOpenId] = useState<string>()
  const resolve = useResolveMessage()
  const resolveFromCard = (id: string) =>
    resolve.mutate(
      { id, resolved: true },
      {
        onSuccess: () => toast.success('Mensagem marcada como resolvida'),
        onError: () => toast.error('Não foi possível resolver a mensagem'),
      },
    )

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold">IMCR</h1>
          <p className="m-0 text-xs text-muted">Triagem inteligente de mensagens</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <Radio className={connected ? 'size-4 text-emerald-500' : 'size-4 text-rose-500'} />
          {connected ? 'Tempo real ativo' : 'Reconectando…'}
        </span>
        {/* No celular o simulador fica abaixo do quadro: atalho para ele. */}
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden"
          onClick={() => document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <Send className="size-4" /> Simulador
        </Button>
        <Button variant="outline" size="icon" onClick={toggle} aria-label="Alternar tema">
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </header>

      <MetricsPanel />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0">
          {isError ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm">
              Não foi possível carregar as mensagens.{' '}
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : isLoading ? (
            <p className="text-sm text-muted">Carregando…</p>
          ) : (
            <KanbanBoard messages={messages} onOpen={setOpenId} onResolve={resolveFromCard} />
          )}
        </main>
        <aside id="playground" className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
          <PlaygroundPanel />
        </aside>
      </div>

      <MessageDetailDialog message={messages.find((m) => m.id === openId)} onClose={() => setOpenId(undefined)} />
      <Toaster richColors position="bottom-right" theme={dark ? 'dark' : 'light'} />
    </div>
  )
}
