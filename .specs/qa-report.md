# Relatório de QA - IMCR (ponta a ponta)

Ambiente: LLM_PROVIDER=fake, API em :3000, Vite em :5173 (proxy, VITE_USE_MOCKS=false), Chrome.

## Resultados

| # | Item | Resultado | Evidência |
|---|------|-----------|-----------|
| 1 | GET /health, /api/messages, /api/metrics | PASS | 200; metrics {total, sentiments, completed, corrected, accuracy} |
| 1 | POST válido | PASS | 201, status PENDING; depois COMPLETED em ~10-80 ms |
| 1 | POST nome vazio / corpo vazio / sem campos / JSON inválido / >5000 chars / nome >200 | PASS | todos 400 com mensagem do Fastify (em inglês) |
| 1 | POST 5000 chars exatos | PASS | 201 |
| 1 | POST só espaços | PASS | 400 (trim) |
| 1 | PATCH /api/messages/:id/correction válido | PASS | 200; accuracy 1 -> 0.833; voltar ao setor original zera a correção |
| 1 | PATCH setor inválido / corpo vazio | PASS | 400 |
| 1 | PATCH id inexistente / id não-UUID | PASS | 404 `{"error":"Mensagem não encontrada"}` / 400 "Invalid UUID" |
| 1 | /api/events | PASS | message.created, message.updated (PROCESSING), message.updated (COMPLETED) |
| 2 | Carga inicial, "Tempo real ativo", métricas | PASS | |
| 2 | 5 cenários do Playground | PASS (ver nota hidden-tab) | Após reload: raiva->Urgente, estoque->Estoque, boleto->Financeiro, técnico->Suporte, orçamento->Vendas. Toast "Mensagem enviada para triagem"; card entra em "Em triagem / Na fila" |
| 2 | Formulário vazio | PASS | Toast "Informe o nome do cliente" |
| 2 | Dialog de detalhe | PASS | Campos: mensagem, sentimento, setor sugerido, urgência, confiança, resumo, ação recomendada, select de correção; Escape fecha; foco entra no dialog; Enter no card abre |
| 2 | Corrigir setor | PASS | Toast "Setor atualizado para Vendas", precisão 100% -> 92%, card muda de coluna, selo de correção (ícone de lápis) |
| 2 | Tema claro/escuro | PASS | persistido em localStorage; contraste ok |
| 2 | Reload persiste estado | PASS | |
| 2 | Duas abas recebem o mesmo evento | PASS | |
| 2 | Foco visível por teclado | PASS | outline 2px indigo |
| 2 | Console / rede | PASS | sem erros de console nem requisições com erro |
| 2 | Largura 400px | PARCIAL | resize_window não alterou o viewport; testado via iframe 400px: sem overflow horizontal, métricas empilhadas, board com rolagem horizontal (colunas 288px) |
| 3 | Worker parado | PASS | mensagem fica PENDING / "Na fila" e é processada ao religar (~6 s) |
| 3 | Restart da API | PASS | health 200 em ~2 s; o app abriu novo /api/events e refez fetch; mensagens novas aparecem; dados persistem |
| 4 | Emojis/acentos/HTML | PASS | `<script>` e `<b>` renderizados como texto, sem XSS |
| 4 | 5000 chars | PASS | |
| 4 | 20 mensagens em paralelo | PASS | 201 em 312 ms, todas COMPLETED, latência máx 78 ms, ordem mais recente primeiro |
| 4 | Coluna cheia | PASS | colunas crescem; página rola verticalmente (sem scroll interno) |
| 4 | Sem palavra-chave | PASS (UX discutível) | cai em HUMAN_REVIEW -> coluna "Urgente", sentimento Calmo, urgência 25% |

**Correção (bug real, não era da aba oculta):** o QA anotou "cards presos em Na fila até o reload" como efeito da aba oculta e só validou os 5 cenários "após reload". Na verdade era uma corrida: `useCreateMessage.onSuccess` aplicava a resposta do POST (retrato `PENDING`) por cima do `COMPLETED` que o SSE já tinha colocado no cache, e o card ficava preso até o F5 (o usuário confirmou no Chrome em primeiro plano). Corrigido em `applyEvent`, que agora nunca troca um estado por outro de etapa menor; teste de regressão em `hooks/useMessages.test.tsx`. Reproduzido antes (4/4 presos pelo formulário) e verificado depois (4/4 na coluna certa).

Nota de método: a aba do Chrome ficou com `document.visibilityState = hidden`, então as animações do framer-motion (saída de cards, contadores, toasts) congelam. Isso gerou cards-fantasma "Na fila" em "Em triagem" e contadores de coluna desatualizados que desapareceram ao recarregar. Não foi possível confirmar visualmente a transição Na fila -> Analisando -> coluna final em aba visível; os dados de DOM/API e o SSE estão corretos.

## Bugs / achados (por severidade)

1. MÉDIA (UX/copy): mensagem sem palavra-chave vai para HUMAN_REVIEW e aparece na coluna "Urgente" com selo "Calmo" e urgência 25%. Passos: POST {"customerName":"Beto","rawContent":"Bom dia, tudo bem?"}. Esperado: coluna de revisão humana coerente (ou rótulo "Revisão humana / Urgente"). Observado: mistura "Urgente" com "Calmo". Sugestão: renomear a coluna para "Revisão humana" ou exibir um selo "Revisão humana" nos cards dessa coluna.
2. MÉDIA (a11y): todo o board é `aria-live="polite"` (a região inteira, incluindo cards). Leitores de tela tendem a reanunciar colunas inteiras a cada update. Sugestão: live region dedicada e curta ("Nova mensagem em Financeiro").
3. BAIXA (a11y): seções das colunas sem nome acessível (aria-label/labelledby nulos). Ao fechar o dialog por Escape, o foco vai para BODY e não para o card de origem (o card remonta ao mudar de coluna).
4. BAIXA (UX): barra de urgência sempre vermelha, mesmo com 25%; cor não reflete gravidade. O resumo do fake LLM vem truncado com "..." no detalhe.
5. BAIXA (UX mobile): no celular o Simulador fica abaixo de todo o board (y~1570 px); o usuário precisa rolar muito. Sugestão: simulador colapsável/no topo ou âncora.
6. BAIXA (copy/API): mensagens de validação 400 vêm em inglês e técnicas ("body/customerName Too small...") e a 404 em pt-BR; padronizar. Após enviar pelo formulário, o nome é mantido e a mensagem limpa (provavelmente intencional).
7. BAIXA (dev): EventSource aberto direto via proxy do Vite ficou "zumbi" (readyState 1, sem eventos) após reiniciar a API; o app reconectou por conta própria, então só afeta clientes externos/proxy.

## Status das correções

| # | Status | Como foi resolvido |
|---|--------|--------------------|
| 1 | Corrigido | Selo "Revisão humana" nos cards com setor HUMAN_REVIEW (a coluna continua "Urgente") |
| 2 | Corrigido | `aria-live` saiu do board; região `role="status"` curta com a contagem de mensagens |
| 3 | Corrigido | Colunas com `aria-label`; foco volta ao card de origem ao fechar o detalhe (`onCloseAutoFocus`) |
| 4 | Corrigido | Barra de urgência verde/âmbar/vermelha (`urgencyColor`); resumo do fake LLM vai até 140 chars e abrevia em fronteira de palavra |
| 5 | Corrigido | Botão "Simulador" no cabeçalho (só mobile) rola até o painel |
| 6 | Corrigido | `setErrorHandler` devolve `{ error: "Dados inválidos", details }`; Zod com locale pt |
| 7 | Corrigido | Servidor envia evento nomeado `ping` a cada 15 s; o cliente reabre a conexão após 45 s sem eventos e ressincroniza as listas ao reconectar |

| Nota de método | Corrigido | Cards-fantasma com a aba oculta: o rAF pausa e a animação de saída (`exit`) do framer-motion nunca termina, deixando o card antigo no DOM ao lado do novo. `usePageVisible` remove o `exit` enquanto a aba está oculta. Reproduzido e verificado no Chrome real (aba `hidden`): antes, a mesma mensagem em "Em triagem" e "Financeiro"; depois, uma só, e contadores iguais ao DOM. Teste: `MessageCard.hidden.test.tsx` |

Pendente de verificação visual: a transição Na fila -> Analisando -> coluna final com a aba visível (só dá para ver com a janela em primeiro plano), e a rolagem horizontal com a roda do mouse no Chrome real (coberta só por testes em jsdom).

## Divergências do spec
Rota de correção é PATCH /api/messages/:id/correction (não PATCH /api/messages/:id); conferido que frontend e backend concordam. Nenhuma outra divergência encontrada.

Estado final: postgres, redis, app-backend e worker rodando; Vite rodando em :5173. Dados de teste (~38 mensagens "Burst", "QA proxy", etc.) permanecem no banco.
