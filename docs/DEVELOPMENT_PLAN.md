# Plano de Desenvolvimento por Etapas

Sistema de Controle Financeiro Pessoal — cronograma sugerido para implementação incremental.

---

## Fase 0: Setup do Projeto (Semana 1)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 0.1 | Criar projeto Vite + React | `npm create vite@latest . -- --template react` |
| 0.2 | Instalar dependências | firebase, react-router-dom, zustand (ou context), recharts, react-hook-form, date-fns |
| 0.3 | Configurar Firebase | Criar projeto no console, habilitar Auth (Email/Password) e Firestore |
| 0.4 | Variáveis de ambiente | `.env` com `VITE_FIREBASE_*` (apiKey, authDomain, projectId, etc.) |
| 0.5 | Estrutura de pastas | Criar pastas `src/api`, `src/features`, `src/store`, `src/models`, `src/utils`, `src/components/ui`, `src/routes` |
| 0.6 | Firestore rules e índices | Publicar `firestore.rules` e `firestore.indexes.json` iniciais |

**Entregável:** App sobe com Vite, Firebase conectado, sem erros.

---

## Fase 1: Autenticação e Workspace (Semanas 2–3)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 1.1 | Tela de Login | Email/senha, link para registro, tratamento de erro |
| 1.2 | Tela de Registro | Email, senha, confirmação; criar usuário no Firebase Auth |
| 1.3 | ProtectedRoute | Redirecionar não autenticados para `/login` |
| 1.4 | Store de autenticação | Zustand ou AuthContext: user, loading, login, logout, register |
| 1.5 | Criação do primeiro workspace | Após login, se usuário não tem workspace, redirecionar para "Criar workspace" (nome); criar doc em `workspaces` e em `workspaces/{id}/members/{uid}` com role admin |
| 1.6 | Listagem de workspaces | Query em `users/{uid}/workspaceIds` ou em `workspaces` filtrando por membership (via regras); se não usar workspaceIds, buscar workspaces onde `members/{uid}` existe |
| 1.7 | Troca de workspace ativo | Dropdown no header; salvar workspaceId no store global |
| 1.8 | Layout base | Header (com workspace switcher e logout), sidebar (desktop), menu mobile |

**Entregável:** Login, registro, criação e seleção de workspace funcionando.

---

## Fase 2: Contas e Categorias (Semana 4)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 2.1 | CRUD de contas | Listar, criar, editar, desativar contas no workspace atual |
| 2.2 | Tipos de conta | bank, digital_wallet, cash, investment; saldo inicial e atual |
| 2.3 | Campo de rendimento | yieldRate (ex: 1.02), yieldReference (ex: "CDI"); opcional |
| 2.4 | Simulador de rendimento | Função em `utils`: dado saldo e taxa, retornar projeção mensal/anual; componente na tela de contas |
| 2.5 | Seed de categorias | Ao criar workspace, criar categorias padrão (Alimentação, Transporte, etc.) em `categories` |
| 2.6 | CRUD de categorias (não-sistema) | Usuário pode criar/editar categorias; isSystem = false; não permitir deletar isSystem |

**Entregável:** Múltiplas contas com saldo e rendimento; categorias padrão e customizadas.

---

## Fase 3: Transações (Semana 5)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 3.1 | Tipos de transação | income, expense, transfer, investment, yield |
| 3.2 | Formulário de transação | Conta, categoria (para income/expense), valor, data, descrição; para transferência: conta destino |
| 3.3 | Atualização de saldo | Ao criar/editar/deletar transação, recalcular `currentBalance` da(s) conta(s) (no cliente ou futuramente Cloud Function) |
| 3.4 | Listagem de transações | Tabela/cards com filtros: mês, categoria, conta |
| 3.5 | Filtros | Componente TransactionFilters (mês, categoria, conta); persistir em estado ou URL |

**Entregável:** Lançamento e listagem de transações com filtros; saldo das contas atualizado.

---

## Fase 4: Cartão de Crédito e Parcelas (Semanas 6–7)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 4.1 | CRUD de cartões | Nome, closingDay, dueDay, limite (opcional) |
| 4.2 | Modelo de compra | description, categoryId, totalAmount, purchaseDate, type (single/installments/recurring), installmentsCount |
| 4.3 | Utilitário de parcelas | `utils/installments.js`: gerar array de parcelas (dueDate, closingDate, amount) conforme regras do ARCHITECTURE |
| 4.4 | Criação de compra + parcelas | Ao salvar compra, gerar parcelas e persistir em subcoleção (ou array em purchases) |
| 4.5 | Fatura atual vs futura | Consultar parcelas por closingDate/dueDate; separar "este mês" e "próximos meses" |
| 4.6 | Valor pago / restante | Por compra: somar parcelas paid; restante = total - pago |
| 4.7 | Pagamento de parcela | Ao "pagar", criar transação de saída (ou débito da conta) e vincular installment (status paid, transactionId); opcional: marcar parcela como paga sem transação |
| 4.8 | Assinaturas (recorrente) | type recurring: gerar parcelas mensais (ex.: 12 meses ou "ilimitado" com data fim); ou job mensal que cria nova parcela |

**Entregável:** Cartões, compras parceladas/únicas/recorrentes, fatura atual/futura e pagamento de parcelas.

---

## Fase 5: Dashboard (Semana 8)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 5.1 | Saldo total | Soma de currentBalance de todas as contas ativas |
| 5.2 | Total gasto no mês | Soma de transactions type expense no mês atual |
| 5.3 | Total recebido no mês | Soma de transactions type income (e yield se desejar) no mês atual |
| 5.4 | Fatura atual | Soma das parcelas da fatura atual (cartões) |
| 5.5 | Próximas contas a vencer | Lista de parcelas com dueDate nos próximos 7–15 dias, ordenadas por data |
| 5.6 | Gráfico por categoria | Recharts (pie ou bar) com gastos por categoria no mês |
| 5.7 | Evolução do patrimônio | Gráfico de linha: saldo total ao fim de cada mês (ou dia); calcular a partir de transações históricas |

**Entregável:** Dashboard com todos os blocos e gráficos funcionando.

---

## Fase 6: Multiusuário e Convites (Semana 9)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 6.1 | Convite por e-mail | Modal: campo e-mail, role (member/admin); criar doc em `invitations` com status pending, expiresAt (ex.: 7 dias) |
| 6.2 | Listagem de convites pendentes | Na tela de configurações do workspace, listar convites enviados |
| 6.3 | Aceitar convite | Usuário logado com mesmo e-mail: ao abrir app ou rota /invite/:id, verificar convite; ao aceitar: criar `members/{uid}` e atualizar invitation status accepted |
| 6.4 | Listagem de membros | Exibir membros do workspace (email, role); apenas admin pode remover (futuro) |
| 6.5 | userWorkspaceIds | Ao criar workspace ou aceitar convite, criar `users/{uid}/workspaceIds/{workspaceId}` para listar "meus workspaces" sem varrer todas as workspaces |

**Entregável:** Convite por e-mail, aceite e listagem de membros; dados compartilhados entre membros.

---

## Fase 7: Refino e Segurança (Semana 10)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 7.1 | Revisão das regras Firestore | Garantir que nenhuma subcoleção seja acessível sem membership; testar com usuário não membro |
| 7.2 | Responsividade | Ajustes em layout, tabelas e gráficos para mobile |
| 7.3 | Tratamento de erros | Toasts ou mensagens para falhas de rede e permissão |
| 7.4 | Loading states | Skeletons ou spinners em listagens e dashboard |
| 7.5 | Validações | Campos obrigatórios e formatos (valor, data) nos formulários |

**Entregável:** App estável, segura e usável em desktop e mobile.

---

## Ordem sugerida de implementação (resumo)

1. **Setup** → **Auth + Workspace** → **Contas + Categorias** → **Transações** → **Cartão + Parcelas** → **Dashboard** → **Convites** → **Refino**.

Cada fase pode ser quebrada em PRs menores (ex.: 3.1 + 3.2 em um PR, 3.3 + 3.4 em outro). Priorize testes manuais em cada entrega antes de seguir.
