import { Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCreateMessage } from '@/hooks/useMessages'
import { CreateMessageSchema } from '@/lib/schemas'

const SCENARIOS = [
  { label: 'Cliente com raiva', name: 'Marcos Silva', text: 'ISSO É UM ABSURDO!! Já é a terceira vez que cobram errado, vou cancelar e procurar o Procon.' },
  { label: 'Dúvida de estoque', name: 'Ana Souza', text: 'Olá, o produto X está disponível em estoque? Qual o prazo de envio para Curitiba?' },
  { label: 'Boleto / financeiro', name: 'Carlos Lima', text: 'Preciso da segunda via do boleto, venceu ontem e não consegui pagar.' },
  { label: 'Problema técnico', name: 'Julia Rocha', text: 'O sistema travou e dá erro no login desde cedo, pode me ajudar?' },
  { label: 'Orçamento', name: 'Empresa Alfa', text: 'Gostaria de um orçamento para upgrade do plano para 50 usuários.' },
]

export function PlaygroundPanel() {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const create = useCreateMessage()

  const send = (input: { customerName: string; rawContent: string }) => {
    const parsed = CreateMessageSchema.safeParse(input)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Dados inválidos')
      return
    }
    create.mutate(parsed.data, {
      onSuccess: () => toast.success('Mensagem enviada para triagem'),
      onError: () => toast.error('Falha ao enviar a mensagem'),
    })
  }

  const field =
    'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent'

  return (
    <section aria-label="Simulador de entrada" className="rounded-xl border border-border bg-surface p-4">
      <h2 className="m-0 text-sm font-semibold">Simulador de entrada</h2>
      <p className="mt-1 text-xs text-muted">Teste a triagem com cenários prontos ou escreva a sua mensagem.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            size="sm"
            disabled={create.isPending}
            onClick={() => send({ customerName: s.name, rawContent: s.text })}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send({ customerName: name, rawContent: text })
          setText('')
        }}
      >
        <input className={field} placeholder="Nome do cliente" aria-label="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className={field} rows={4} placeholder="Mensagem do cliente" aria-label="Mensagem do cliente" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" disabled={create.isPending}>
          <Send className="size-4" /> Enviar
        </Button>
      </form>
    </section>
  )
}
