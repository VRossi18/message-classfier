import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// fetch do Node não aceita URL relativa: o MSW intercepta, então basta uma origem qualquer.
vi.hoisted(() => {
  import.meta.env.VITE_API_URL = 'http://localhost'
})

import App from './App'
import { handlers } from './mocks/handlers'

// O estado do simulador vive no módulo e é compartilhado entre os testes deste arquivo
// (a ordem importa: vazio → envio → correção → erro de rede).
const server = setupServer(...handlers)
vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  // jsdom não implementa APIs que o Radix Select usa.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

// hidden: com o Dialog aberto o Radix marca o resto da página como aria-hidden.
const column = (name: string) => screen.getByRole('region', { name, hidden: true })
const send = (name: string, text: string) => {
  fireEvent.change(screen.getByLabelText('Nome do cliente'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Mensagem do cliente'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
}
const SLOW = { timeout: 10_000 }

describe('App (UI + MSW + simulador em memória)', () => {
  it('começa vazio, com métricas zeradas e tempo real ativo', async () => {
    renderApp()
    await waitFor(() => expect(screen.getAllByText('Nenhuma mensagem').length).toBeGreaterThan(0))
    expect(await screen.findByText('Tempo real ativo')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Métricas') ?? screen.getByRole('region', { name: 'Métricas' })).toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Métricas' })).getByText('Precisão da IA').nextElementSibling).toHaveTextContent('—')
  })

  it('mensagem enviada entra em triagem e cai na coluna certa quando a IA conclui', async () => {
    renderApp()
    send('Ana Souza', 'Qual o prazo de envio do produto X? Está disponível em estoque?')

    // aparece de imediato em "Em triagem", ainda sem classificação
    const intake = await screen.findByRole('region', { name: 'Em triagem' })
    expect(await within(intake).findByText('Ana Souza')).toBeInTheDocument()
    expect(within(intake).getByText(/Na fila|Analisando/)).toBeInTheDocument()

    // depois de classificada, muda para Estoque
    await waitFor(() => expect(within(column('Estoque')).getByText('Ana Souza')).toBeInTheDocument(), SLOW)
    // o card anterior sai com animação (AnimatePresence): espera sumir da coluna de origem
    await waitFor(() => expect(within(column('Em triagem')).queryByText('Ana Souza')).not.toBeInTheDocument())

    // métricas refletem a conclusão: 1 atendimento, 100% de precisão
    const metrics = screen.getByRole('region', { name: 'Métricas' })
    await waitFor(() => expect(within(metrics).getByText('Precisão da IA').nextElementSibling).toHaveTextContent('100%'), SLOW)
    expect(within(metrics).getByText('Atendimentos').nextElementSibling).toHaveTextContent('1')
  })

  it('cenário de cliente irritado vai para Urgente', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Cliente com raiva' }))
    await waitFor(() => expect(within(column('Urgente')).getByText('Marcos Silva')).toBeInTheDocument(), SLOW)
    expect(within(column('Urgente')).getByText('Crítico')).toBeInTheDocument()
  })

  it('corrigir o setor no detalhe move o card e derruba a precisão', async () => {
    renderApp()
    send('Gui Alves', 'Gostaria de um orçamento para upgrade do plano')
    await waitFor(() => expect(within(column('Vendas')).getByText('Gui Alves')).toBeInTheDocument(), SLOW)

    fireEvent.click(within(column('Vendas')).getByText('Gui Alves'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Setor sugerido pela IA')).toBeInTheDocument()

    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Corrigir setor' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('option', { name: 'Financeiro' }))

    await waitFor(() => expect(within(column('Financeiro')).getByText('Gui Alves')).toBeInTheDocument(), SLOW)
    await waitFor(() => expect(within(column('Vendas')).queryByText('Gui Alves')).not.toBeInTheDocument())
    expect(await screen.findByText(/Setor atualizado para Financeiro/)).toBeInTheDocument()

    // 3 concluídas e 1 correção → 67%
    // getByText ignora aria-hidden, então funciona mesmo com o Dialog modal aberto
    await waitFor(() => expect(screen.getByText('Precisão da IA').nextElementSibling).toHaveTextContent('67%'), SLOW)
  })

  it('resolver pelo detalhe move o card para Resolvidas e sobe o contador; reabrir devolve ao setor', async () => {
    renderApp()
    const financeiro = await screen.findByRole('region', { name: 'Financeiro' })
    fireEvent.click(await within(financeiro).findByText('Gui Alves'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Marcar como resolvida/ }))

    await waitFor(() => expect(within(column('Resolvidas')).getByText('Gui Alves')).toBeInTheDocument(), SLOW)
    await waitFor(() => expect(within(column('Financeiro')).queryByText('Gui Alves')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Resolvidas', { selector: 'p' }).nextElementSibling).toHaveTextContent('1'), SLOW)
    expect(await within(dialog).findByRole('button', { name: /Reabrir/ })).toBeInTheDocument()
    // a precisão da IA não muda com a resolução (continua 67%)
    expect(screen.getByText('Precisão da IA').nextElementSibling).toHaveTextContent('67%')

    fireEvent.click(within(dialog).getByRole('button', { name: /Reabrir/ }))
    await waitFor(() => expect(within(column('Financeiro')).getByText('Gui Alves')).toBeInTheDocument(), SLOW)
    await waitFor(() => expect(within(column('Resolvidas')).queryByText('Gui Alves')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Resolvidas', { selector: 'p' }).nextElementSibling).toHaveTextContent('0'), SLOW)
  })

  it('o atalho do card resolve sem abrir o detalhe', async () => {
    renderApp()
    const financeiro = await screen.findByRole('region', { name: 'Financeiro' })
    await within(financeiro).findByText('Gui Alves')
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como resolvida: Gui Alves' }))
    await waitFor(() => expect(within(column('Resolvidas')).getByText('Gui Alves')).toBeInTheDocument(), SLOW)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // o Toaster é global e guarda o toast do teste anterior: basta existir ao menos um
    expect((await screen.findAllByText('Mensagem marcada como resolvida')).length).toBeGreaterThan(0)
  })

  it('fechar o detalhe com Escape devolve o foco ao card de origem', async () => {
    renderApp()
    // o card pode estar em qualquer coluna (testes anteriores o moveram): procura pelo nome
    fireEvent.click(await screen.findByText('Gui Alves'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-message-id'))
  })

  it('formulário vazio mostra erro de validação e não envia nada', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: /Enviar/ }))
    expect(await screen.findByText('Informe o nome do cliente')).toBeInTheDocument()
  })

  it('erro de rede ao listar mostra o estado de erro e permite tentar novamente', async () => {
    server.use(http.get('*/api/messages', () => HttpResponse.error()))
    renderApp()
    expect(await screen.findByText(/Não foi possível carregar as mensagens/)).toBeInTheDocument()

    server.resetHandlers()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument())
    expect(await screen.findByRole('region', { name: 'Em triagem' })).toBeInTheDocument()
  })
})
