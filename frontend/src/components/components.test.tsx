import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/lib/schemas'

const mutate = vi.fn()
const createMutate = vi.fn()
const resolveMutate = vi.fn()
let createPending = false
let metricsData: unknown

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useMessages', () => ({
  useMetrics: () => ({ data: metricsData }),
  useCorrectSector: () => ({ mutate }),
  useCreateMessage: () => ({ mutate: createMutate, isPending: createPending }),
  useResolveMessage: () => ({ mutate: resolveMutate, isPending: false }),
}))
// Radix Select depende de APIs de ponteiro ausentes no jsdom: troca por <select> nativo.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, options, ariaLabel }: {
    value?: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel: string
  }) => (
    <select aria-label={ariaLabel} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}))

import { toast } from 'sonner'
import { KanbanBoard } from './kanban/KanbanBoard'
import { MessageCard } from './kanban/MessageCard'
import { MessageDetailDialog } from './message/MessageDetailDialog'
import { MetricsPanel } from './metrics/MetricsPanel'
import { PlaygroundPanel } from './playground/PlaygroundPanel'

const base: Message = {
  id: '1', customerName: 'Ana', rawContent: 'texto bruto', assignedSector: null, sentiment: null,
  urgencyScore: null, confidenceScore: null, summary: null, suggestedAction: null,
  correctedSector: null, status: 'PENDING', createdAt: '2026-01-01T00:00:00Z', processedAt: null, resolvedAt: null,
}
const done = (o: Partial<Message> = {}): Message => ({
  ...base, status: 'COMPLETED', assignedSector: 'STOCK', sentiment: 'CALM', urgencyScore: 0.42,
  confidenceScore: 0.9, summary: 'resumo ia', suggestedAction: 'fazer algo', ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
  createPending = false
  metricsData = undefined
})

describe('MessageCard', () => {
  it('PENDING mostra "Na fila" e sem medidor', () => {
    render(<ul><MessageCard message={base} onOpen={() => {}} /></ul>)
    expect(screen.getByText('Na fila')).toBeInTheDocument()
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.getByText('texto bruto')).toBeInTheDocument()
  })
  it('PROCESSING mostra "Analisando"', () => {
    render(<ul><MessageCard message={{ ...base, status: 'PROCESSING' }} onOpen={() => {}} /></ul>)
    expect(screen.getByText('Analisando')).toBeInTheDocument()
  })
  it('FAILED mostra "Falhou" sem medidor', () => {
    render(<ul><MessageCard message={{ ...base, status: 'FAILED' }} onOpen={() => {}} /></ul>)
    expect(screen.getByText('Falhou')).toBeInTheDocument()
    expect(screen.queryByRole('meter')).toBeNull()
  })
  it('COMPLETED mostra sentimento, resumo e urgência', () => {
    render(<ul><MessageCard message={done()} onOpen={() => {}} /></ul>)
    expect(screen.getByText('Calmo')).toBeInTheDocument()
    expect(screen.getByText('resumo ia')).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.queryByTitle('Setor corrigido por humano')).toBeNull()
  })
  it('selo de correção só aparece quando corrigida', () => {
    render(<ul><MessageCard message={done({ correctedSector: 'SALES' })} onOpen={() => {}} /></ul>)
    expect(screen.getByTitle('Setor corrigido por humano')).toBeInTheDocument()
  })
  it('clique chama onOpen com o id', () => {
    const onOpen = vi.fn()
    render(<ul><MessageCard message={base} onOpen={onOpen} /></ul>)
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('1')
  })
})

describe('MessageCard: resolvida', () => {
  const resolvedAt = '2026-01-02T09:00:00Z'
  it('mostra o selo "Resolvida" no lugar do sentimento e esconde o medidor e o atalho', () => {
    render(<ul><MessageCard message={done({ resolvedAt })} onOpen={() => {}} onResolve={() => {}} /></ul>)
    expect(screen.getByText('Resolvida')).toBeInTheDocument()
    expect(screen.queryByText('Calmo')).toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.queryByRole('button', { name: /Marcar como resolvida/ })).toBeNull()
  })
  it('atalho de resolver aparece só em COMPLETED aberta, é irmão do card e chama onResolve', () => {
    const onOpen = vi.fn()
    const onResolve = vi.fn()
    render(<ul><MessageCard message={done()} onOpen={onOpen} onResolve={onResolve} /></ul>)
    const shortcut = screen.getByRole('button', { name: 'Marcar como resolvida: Ana' })
    expect(shortcut.closest('button:not([aria-label])')).toBeNull() // não está aninhado em outro botão
    fireEvent.click(shortcut)
    expect(onResolve).toHaveBeenCalledWith('1')
    expect(onOpen).not.toHaveBeenCalled()
  })
  it.each([['PENDING'], ['PROCESSING'], ['FAILED']] as const)('sem atalho para mensagem %s', (status) => {
    render(<ul><MessageCard message={{ ...base, status }} onOpen={() => {}} onResolve={() => {}} /></ul>)
    expect(screen.queryByRole('button', { name: /Marcar como resolvida/ })).toBeNull()
  })
  it('sem a prop onResolve não há atalho', () => {
    render(<ul><MessageCard message={done()} onOpen={() => {}} /></ul>)
    expect(screen.queryByRole('button', { name: /Marcar como resolvida/ })).toBeNull()
  })
})

describe('KanbanBoard', () => {
  const column = (name: string) => screen.getByRole('heading', { name }).closest('section')!

  it('distribui mensagens nas colunas certas', () => {
    const msgs = [
      base,
      done({ id: '2', customerName: 'Bia', assignedSector: 'FINANCIAL' }),
      done({ id: '3', customerName: 'Caio', sentiment: 'CRITICAL' }),
      done({ id: '4', customerName: 'Duda', assignedSector: 'STOCK', correctedSector: 'SALES' }),
    ]
    render(<KanbanBoard messages={msgs} onOpen={() => {}} />)
    expect(column('Em triagem')).toHaveTextContent('Ana')
    expect(column('Financeiro')).toHaveTextContent('Bia')
    expect(column('Urgente')).toHaveTextContent('Caio')
    expect(column('Vendas')).toHaveTextContent('Duda')
    expect(column('Estoque')).not.toHaveTextContent('Duda')
  })
  it('colunas vazias mostram placeholder', () => {
    render(<KanbanBoard messages={[]} onOpen={() => {}} />)
    expect(screen.getAllByText('Nenhuma mensagem')).toHaveLength(7)
  })
  it('mensagem resolvida vai para a coluna Resolvidas, mesmo sendo crítica', () => {
    const msgs = [done({ id: '5', customerName: 'Eva', sentiment: 'CRITICAL', resolvedAt: '2026-01-02T09:00:00Z' })]
    render(<KanbanBoard messages={msgs} onOpen={() => {}} />)
    expect(column('Resolvidas')).toHaveTextContent('Eva')
    expect(column('Urgente')).not.toHaveTextContent('Eva')
  })
  it('repassa onResolve ao atalho do card', () => {
    const onResolve = vi.fn()
    render(<KanbanBoard messages={[done()]} onOpen={() => {}} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: /Marcar como resolvida/ }))
    expect(onResolve).toHaveBeenCalledWith('1')
  })
  it('repassa onOpen', () => {
    const onOpen = vi.fn()
    render(<KanbanBoard messages={[base]} onOpen={onOpen} />)
    fireEvent.click(screen.getByText('Ana'))
    expect(onOpen).toHaveBeenCalledWith('1')
  })
})

describe('MetricsPanel', () => {
  it('sem dados mostra travessão e zeros', () => {
    render(<MetricsPanel />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Calmo 0')).toBeInTheDocument()
  })
  it('com dados mostra total, precisão e legenda', () => {
    metricsData = { total: 7, sentiments: { CALM: 2, NEUTRAL: 1, ANGRY: 1, CRITICAL: 0 }, corrected: 1, completed: 4, resolved: 3, accuracy: 0.75 }
    render(<MetricsPanel />)
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('1 correção(ões) em 4 concluída(s)')).toBeInTheDocument()
    expect(screen.getByText('Calmo 2')).toBeInTheDocument()
    expect(screen.getByTitle('Calmo: 2')).toHaveStyle({ width: '50%' })
    expect(screen.queryByTitle(/Crítico:/)).toBeNull()
  })
  it('accuracy null mostra travessão mesmo com dados', () => {
    metricsData = { total: 1, sentiments: { CALM: 0, NEUTRAL: 0, ANGRY: 0, CRITICAL: 0 }, corrected: 0, completed: 0, resolved: 0, accuracy: null }
    render(<MetricsPanel />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('MessageDetailDialog', () => {
  it('sem mensagem não renderiza conteúdo', () => {
    render(<MessageDetailDialog message={undefined} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('PENDING mostra aviso e não oferece correção', () => {
    render(<MessageDetailDialog message={base} onClose={() => {}} />)
    expect(screen.getByText(/ainda está analisando/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Corrigir setor')).toBeNull()
  })
  it('COMPLETED mostra detalhes e valor efetivo (correção prevalece)', () => {
    render(<MessageDetailDialog message={done({ correctedSector: 'SALES' })} onClose={() => {}} />)
    expect(screen.getByText('resumo ia')).toBeInTheDocument()
    expect(screen.getByText('fazer algo')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByLabelText('Corrigir setor')).toHaveValue('SALES')
  })
  it('mostra quem classificou, com rótulo legível, e travessão quando não há registro', () => {
    const { unmount } = render(<MessageDetailDialog message={done({ model: 'anthropic:claude-haiku-4-5-20251001' })} onClose={() => {}} />)
    expect(screen.getByText('Classificado por')).toBeInTheDocument()
    expect(screen.getByText('Claude · claude-haiku-4-5-20251001')).toBeInTheDocument()
    unmount()
    render(<MessageDetailDialog message={done({ model: null })} onClose={() => {}} />)
    expect(screen.getByText('Classificado por').nextElementSibling).toHaveTextContent('—')
  })
  it('COMPLETED aberta oferece "Marcar como resolvida"; o clique resolve e avisa por toast', () => {
    render(<MessageDetailDialog message={done()} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /Reabrir/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Marcar como resolvida/ }))
    expect(resolveMutate).toHaveBeenCalledWith({ id: '1', resolved: true }, expect.any(Object))
    const cbs = resolveMutate.mock.calls[0]![1]
    cbs.onSuccess()
    expect(toast.success).toHaveBeenCalledWith('Mensagem marcada como resolvida')
    cbs.onError()
    expect(toast.error).toHaveBeenCalled()
  })
  it('resolvida mostra a data e oferece "Reabrir"', () => {
    render(<MessageDetailDialog message={done({ resolvedAt: '2026-01-02T09:00:00Z' })} onClose={() => {}} />)
    expect(screen.getByText(/Resolvida em/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar como resolvida/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }))
    expect(resolveMutate).toHaveBeenCalledWith({ id: '1', resolved: false }, expect.any(Object))
    resolveMutate.mock.calls[0]![1].onSuccess()
    expect(toast.success).toHaveBeenCalledWith('Mensagem reaberta')
  })
  it.each([['PENDING'], ['PROCESSING'], ['FAILED']] as const)('mensagem %s não oferece resolver', (status) => {
    render(<MessageDetailDialog message={{ ...base, status }} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /resolvida|Reabrir/ })).toBeNull()
  })
  it('trocar o select chama mutate com id e setor, e toasts de sucesso/erro', () => {
    render(<MessageDetailDialog message={done()} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Corrigir setor'), { target: { value: 'FINANCIAL' } })
    expect(mutate).toHaveBeenCalledWith({ id: '1', sector: 'FINANCIAL' }, expect.any(Object))
    const cbs = mutate.mock.calls[0]![1]
    cbs.onSuccess()
    expect(toast.success).toHaveBeenCalledWith('Setor atualizado para Financeiro')
    cbs.onError()
    expect(toast.error).toHaveBeenCalled()
  })
})

describe('PlaygroundPanel', () => {
  it('botão de cenário envia nome e texto prontos', () => {
    render(<PlaygroundPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Boleto / financeiro' }))
    expect(createMutate).toHaveBeenCalledWith(
      { customerName: 'Carlos Lima', rawContent: expect.stringContaining('boleto') },
      expect.any(Object),
    )
    expect(screen.getAllByRole('button')).toHaveLength(6)
  })
  it('submit vazio mostra erro de validação e não envia', () => {
    render(<PlaygroundPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    expect(toast.error).toHaveBeenCalledWith('Informe o nome do cliente')
    expect(createMutate).not.toHaveBeenCalled()
  })
  it('mensagem vazia acusa erro', () => {
    render(<PlaygroundPanel />)
    fireEvent.change(screen.getByLabelText('Nome do cliente'), { target: { value: 'Zé' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    expect(toast.error).toHaveBeenCalledWith('Escreva a mensagem')
  })
  it('submit válido envia aparado e limpa só o texto', () => {
    render(<PlaygroundPanel />)
    fireEvent.change(screen.getByLabelText('Nome do cliente'), { target: { value: '  Zé ' } })
    fireEvent.change(screen.getByLabelText('Mensagem do cliente'), { target: { value: ' olá ' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    expect(createMutate).toHaveBeenCalledWith({ customerName: 'Zé', rawContent: 'olá' }, expect.any(Object))
    expect(screen.getByLabelText('Mensagem do cliente')).toHaveValue('')
    expect(screen.getByLabelText('Nome do cliente')).toHaveValue('  Zé ')
  })
  it('desabilita botões enquanto envia', () => {
    createPending = true
    render(<PlaygroundPanel />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
  })
})
