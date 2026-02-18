# Arquitetura do Sistema de Controle Financeiro Pessoal

## Visão Geral

Sistema web responsivo de controle financeiro pessoal com suporte a múltiplos usuários e compartilhamento de dados via **Workspaces**. Stack: **React + Vite**, **Firebase (Auth + Firestore)**, estado global com **Context API ou Zustand**, gráficos com **Recharts**.

---

## 1. Modelagem das Coleções do Firestore

### Diagrama de Relacionamento

```
users (Firebase Auth - sem coleção)
    │
workspaces
    ├── members (subcoleção)
    ├── accounts (subcoleção)
    │   └── (documentos de conta)
    ├── categories (subcoleção)
    ├── creditCards (subcoleção)
    │   └── creditCardPurchases (subcoleção)
    │       └── purchaseInstallments (subcoleção)
    ├── transactions (subcoleção)
    └── invitations (subcoleção)
```

### 1.1 Coleção `workspaces`

Raiz de todos os dados financeiros. Cada workspace é um “ambiente” compartilhável.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | sim | ID do documento |
| `name` | string | sim | Nome do workspace (ex: "Família Silva") |
| `createdBy` | string | sim | UID do criador |
| `createdAt` | timestamp | sim | Data de criação |
| `updatedAt` | timestamp | sim | Última atualização |

### 1.2 Subcoleção `workspaces/{workspaceId}/members`

Membros com acesso ao workspace.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `userId` | string | sim | UID do usuário (Firebase Auth) |
| `email` | string | sim | E-mail do usuário |
| `role` | string | sim | `admin` \| `member` |
| `joinedAt` | timestamp | sim | Data de entrada |
| `invitedBy` | string | opcional | UID de quem convidou |

**Índice composto:** `userId` (para listar workspaces do usuário).

### 1.3 Subcoleção `workspaces/{workspaceId}/accounts`

Contas bancárias/carteiras (Nubank, PicPay, Dinheiro, etc.).

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | sim | Nome da conta |
| `type` | string | sim | `bank` \| `digital_wallet` \| `cash` \| `investment` |
| `initialBalance` | number | sim | Saldo inicial |
| `currentBalance` | number | sim | Saldo atual (derivado de transações) |
| `yieldRate` | number | opcional | Ex: 1.02 para 102% CDI (decimal) |
| `yieldReference` | string | opcional | Ex: "CDI", "SELIC" |
| `color` | string | opcional | Cor no UI (hex) |
| `isActive` | boolean | sim | Conta ativa ou arquivada |
| `createdAt` | timestamp | sim | |
| `updatedAt` | timestamp | sim | |

### 1.4 Subcoleção `workspaces/{workspaceId}/categories`

Categorias para transações e compras no cartão.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | sim | Ex: "Alimentação", "Transporte" |
| `type` | string | sim | `income` \| `expense` |
| `color` | string | opcional | Cor no UI |
| `icon` | string | opcional | Nome do ícone |
| `isSystem` | boolean | sim | Categoria padrão (não deletável) |
| `createdAt` | timestamp | sim | |

### 1.5 Subcoleção `workspaces/{workspaceId}/creditCards`

Cartões de crédito.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | sim | Ex: "Nubank", "Itaú" |
| `closingDay` | number | sim | Dia do fechamento (1-31) |
| `dueDay` | number | sim | Dia do vencimento (1-31) |
| `limit` | number | opcional | Limite total |
| `isActive` | boolean | sim | |
| `createdAt` | timestamp | sim | |
| `updatedAt` | timestamp | sim | |

### 1.6 Subcoleção `workspaces/{workspaceId}/creditCards/{cardId}/purchases`

Compras no cartão (cabeça da compra; parcelas em subcoleção ou array).

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `description` | string | sim | Nome da compra |
| `categoryId` | string | sim | ID da categoria |
| `totalAmount` | number | sim | Valor total |
| `purchaseDate` | timestamp | sim | Data da compra |
| `type` | string | sim | `single` \| `installments` \| `recurring` |
| `installmentsCount` | number | sim | Total de parcelas (1 se única) |
| `recurringInterval` | string | opcional | `monthly` para assinatura |
| `createdAt` | timestamp | sim | |
| `updatedAt` | timestamp | sim | |

### 1.7 Subcoleção `workspaces/{workspaceId}/creditCards/{cardId}/purchases/{purchaseId}/installments`

Parcelas geradas a partir da compra.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `number` | number | sim | Número da parcela (1, 2, 3...) |
| `amount` | number | sim | Valor da parcela |
| `dueDate` | timestamp | sim | Data de vencimento |
| `closingDate` | timestamp | sim | Fechamento da fatura em que entra |
| `status` | string | sim | `pending` \| `paid` \| `overdue` |
| `paidAt` | timestamp | opcional | Data do pagamento |
| `transactionId` | string | opcional | ID da transação de pagamento |

**Alternativa (mais simples para queries):** armazenar parcelas como **array** dentro do documento `purchases` (até ~20 parcelas). Para muitas parcelas, manter como subcoleção.

### 1.8 Subcoleção `workspaces/{workspaceId}/transactions`

Todas as movimentações (entrada, saída, transferência, investimento, rendimento).

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `type` | string | sim | `income` \| `expense` \| `transfer` \| `investment` \| `yield` |
| `amount` | number | sim | Valor (sempre positivo; sentido pelo type) |
| `accountId` | string | sim | Conta principal |
| `targetAccountId` | string | opcional | Para transferências |
| `categoryId` | string | opcional | Para income/expense |
| `description` | string | opcional | |
| `date` | timestamp | sim | Data da transação |
| `creditCardPurchaseId` | string | opcional | Vincula a parcela paga |
| `installmentId` | string | opcional | Parcela paga |
| `isRecurring` | boolean | sim | Indica se é de assinatura/recorrente |
| `createdAt` | timestamp | sim | |
| `createdBy` | string | sim | UID do usuário |
| `updatedAt` | timestamp | sim | |

### 1.9 Subcoleção `workspaces/{workspaceId}/invitations`

Convites pendentes por e-mail.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `email` | string | sim | E-mail convidado |
| `role` | string | sim | `admin` \| `member` |
| `invitedBy` | string | sim | UID de quem convidou |
| `status` | string | sim | `pending` \| `accepted` \| `rejected` |
| `createdAt` | timestamp | sim | |
| `expiresAt` | timestamp | sim | Expiração do convite |

---

## 2. Estrutura de Pastas do Projeto React

```
finance-control/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   │
│   ├── api/                    # Camada de acesso Firebase
│   │   ├── firebase.js         # Inicialização Firebase
│   │   ├── auth.js             # Auth (login, logout, register)
│   │   ├── firestore/
│   │   │   ├── workspaces.js
│   │   │   ├── accounts.js
│   │   │   ├── categories.js
│   │   │   ├── transactions.js
│   │   │   ├── creditCards.js
│   │   │   └── invitations.js
│   │   └── index.js
│   │
│   ├── components/             # Componentes reutilizáveis
│   │   ├── ui/                 # Botões, inputs, cards, modais
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Modal.jsx
│   │   │   └── Select.jsx
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── MobileNav.jsx
│   │   │   └── Layout.jsx
│   │   └── charts/
│   │       ├── CategoryChart.jsx
│   │       ├── EvolutionChart.jsx
│   │       └── BalanceChart.jsx
│   │
│   ├── features/               # Módulos por domínio
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   ├── LoginForm.jsx
│   │   │   │   ├── RegisterForm.jsx
│   │   │   │   └── ProtectedRoute.jsx
│   │   │   ├── hooks/
│   │   │   │   └── useAuth.js
│   │   │   └── pages/
│   │   │       ├── Login.jsx
│   │   │       └── Register.jsx
│   │   │
│   │   ├── workspace/
│   │   │   ├── components/
│   │   │   │   ├── WorkspaceSwitcher.jsx
│   │   │   │   ├── InviteMemberModal.jsx
│   │   │   │   └── MembersList.jsx
│   │   │   ├── hooks/
│   │   │   │   └── useWorkspace.js
│   │   │   └── pages/
│   │   │       └── WorkspaceSettings.jsx
│   │   │
│   │   ├── accounts/
│   │   │   ├── components/
│   │   │   │   ├── AccountCard.jsx
│   │   │   │   ├── AccountForm.jsx
│   │   │   │   └── YieldSimulator.jsx
│   │   │   ├── hooks/
│   │   │   │   └── useAccounts.js
│   │   │   └── pages/
│   │   │       └── Accounts.jsx
│   │   │
│   │   ├── creditCard/
│   │   │   ├── components/
│   │   │   │   ├── CreditCardList.jsx
│   │   │   │   ├── PurchaseForm.jsx
│   │   │   │   ├── InstallmentsList.jsx
│   │   │   │   ├── CurrentInvoice.jsx
│   │   │   │   └── FutureInvoice.jsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCreditCards.js
│   │   │   │   └── useInstallments.js
│   │   │   └── pages/
│   │   │       └── CreditCards.jsx
│   │   │
│   │   ├── transactions/
│   │   │   ├── components/
│   │   │   │   ├── TransactionList.jsx
│   │   │   │   ├── TransactionForm.jsx
│   │   │   │   └── TransactionFilters.jsx
│   │   │   ├── hooks/
│   │   │   │   └── useTransactions.js
│   │   │   └── pages/
│   │   │       └── Transactions.jsx
│   │   │
│   │   └── dashboard/
│   │       ├── components/
│   │       │   ├── BalanceSummary.jsx
│   │       │   ├── MonthlySummary.jsx
│   │       │   ├── UpcomingBills.jsx
│   │       │   └── CategoryChart.jsx
│   │       ├── hooks/
│   │       │   └── useDashboard.js
│   │       └── pages/
│   │           └── Dashboard.jsx
│   │
│   ├── hooks/                  # Hooks globais
│   │   ├── useMediaQuery.js
│   │   └── useDebounce.js
│   │
│   ├── store/                  # Estado global (Zustand ou Context)
│   │   ├── authStore.js        # ou AuthContext.jsx
│   │   ├── workspaceStore.js
│   │   └── index.js
│   │
│   ├── models/                 # Tipos/entidades (JSDoc ou TypeScript)
│   │   ├── workspace.js
│   │   ├── account.js
│   │   ├── category.js
│   │   ├── transaction.js
│   │   ├── creditCard.js
│   │   └── index.js
│   │
│   ├── utils/
│   │   ├── date.js
│   │   ├── currency.js
│   │   ├── installments.js     # Geração de parcelas
│   │   └── validation.js
│   │
│   ├── config/
│   │   └── constants.js
│   │
│   └── routes/
│       └── index.jsx           # React Router + ProtectedRoute
│
├── docs/
│   ├── ARCHITECTURE.md         # Este documento
│   ├── DEVELOPMENT_PLAN.md     # Plano por etapas
│   └── FIRESTORE_RULES.md      # Referência das regras
│
├── firestore.rules             # Regras de segurança
├── firestore.indexes.json      # Índices compostos
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## 3. Estrutura das Entidades (Models)

Definições em JavaScript (com JSDoc) para tipagem e validação. Podem ser migradas para TypeScript depois.

### 3.1 Workspace

```js
// models/workspace.js
/**
 * @typedef {Object} Workspace
 * @property {string} id
 * @property {string} name
 * @property {string} createdBy
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} WorkspaceMember
 * @property {string} userId
 * @property {string} email
 * @property {'admin'|'member'} role
 * @property {import('firebase/firestore').Timestamp} joinedAt
 * @property {string} [invitedBy]
 */
```

### 3.2 Account

```js
// models/account.js
/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {'bank'|'digital_wallet'|'cash'|'investment'} type
 * @property {number} initialBalance
 * @property {number} currentBalance
 * @property {number} [yieldRate]
 * @property {string} [yieldReference]
 * @property {string} [color]
 * @property {boolean} isActive
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */
```

### 3.3 Category

```js
// models/category.js
/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {'income'|'expense'} type
 * @property {string} [color]
 * @property {string} [icon]
 * @property {boolean} isSystem
 * @property {import('firebase/firestore').Timestamp} createdAt
 */
```

### 3.4 Transaction

```js
// models/transaction.js
/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {'income'|'expense'|'transfer'|'investment'|'yield'} type
 * @property {number} amount
 * @property {string} accountId
 * @property {string} [targetAccountId]
 * @property {string} [categoryId]
 * @property {string} [description]
 * @property {import('firebase/firestore').Timestamp} date
 * @property {string} [creditCardPurchaseId]
 * @property {string} [installmentId]
 * @property {boolean} isRecurring
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {string} createdBy
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */
```

### 3.5 Credit Card e Parcelas

```js
// models/creditCard.js
/**
 * @typedef {Object} CreditCard
 * @property {string} id
 * @property {string} name
 * @property {number} closingDay
 * @property {number} dueDay
 * @property {number} [limit]
 * @property {boolean} isActive
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} CreditCardPurchase
 * @property {string} id
 * @property {string} description
 * @property {string} categoryId
 * @property {number} totalAmount
 * @property {import('firebase/firestore').Timestamp} purchaseDate
 * @property {'single'|'installments'|'recurring'} type
 * @property {number} installmentsCount
 * @property {string} [recurringInterval]
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} Installment
 * @property {string} id
 * @property {number} number
 * @property {number} amount
 * @property {import('firebase/firestore').Timestamp} dueDate
 * @property {import('firebase/firestore').Timestamp} closingDate
 * @property {'pending'|'paid'|'overdue'} status
 * @property {import('firebase/firestore').Timestamp} [paidAt]
 * @property {string} [transactionId]
 */
```

---

## 4. Fluxo de Autenticação

1. **Inicialização:** App carrega → verifica `onAuthStateChanged` do Firebase Auth.
2. **Não autenticado:** Redireciona para `/login` (ou `/register`). Rotas internas protegidas por `ProtectedRoute`.
3. **Autenticado:** Busca workspaces onde o usuário é membro (query em `members` com `userId == auth.uid`). Se não houver workspace, redireciona para criação do primeiro.
4. **Workspace ativo:** Salvo no estado global (Zustand/Context). Todas as leituras do Firestore usam `workspaceId` atual.
5. **Logout:** Limpa estado global e redireciona para `/login`.

Fluxo de convite:
- Admin envia convite (cria documento em `invitations` com `email` e `status: 'pending'`).
- Usuário convidado faz login (ou cadastro) com o mesmo e-mail.
- Ao entrar no app, verifica se existe convite pendente para seu e-mail; se existir, exibe aceitar/recusar.
- Ao aceitar: cria documento em `members` e atualiza `invitations.status` para `accepted`.

---

## 5. Estratégia de Geração de Parcelas

### 5.1 Regras de negócio

- **Compra única (`single`):** 1 parcela, vencimento no próximo ciclo (fechamento + 1 até dueDay).
- **Parcelada (`installments`):** N parcelas mensais; cada parcela entra na fatura cujo **fechamento** seja anterior ou igual ao vencimento da parcela.
- **Recorrente (`recurring`):** Gera parcelas mensais indefinidamente (ou até N meses); pode ser tratado como parcelada com muitas parcelas ou com job que cria nova parcela a cada mês.

### 5.2 Algoritmo (parcelada)

1. Dado: `purchaseDate`, `closingDay`, `dueDay`, `installmentsCount`, `totalAmount`.
2. Valor por parcela: `totalAmount / installmentsCount` (arredondar centavos na última se necessário).
3. Para cada `i` de 1 a `installmentsCount`:
   - **Due date da parcela i:** Mês de `purchaseDate` + i (ajustar dia para `dueDay`; se não existir no mês, usar último dia).
   - **Closing date:** No mês da due date, o fechamento é `closingDay`. A parcela entra na fatura que fecha no mês anterior ao vencimento (ex.: vence dia 10 → fatura que fecha no mês anterior).
   - Criar documento de parcela com `number`, `amount`, `dueDate`, `closingDate`, `status: 'pending'`.
4. Persistir parcelas na subcoleção `installments` ou no array do documento `purchases` (conforme decisão de modelagem).

### 5.3 Fatura atual vs futura

- **Fatura atual:** Parcelas com `dueDate` no mês corrente (ou próximo vencimento do ciclo atual, conforme regra do cartão).
- **Fatura futura:** Parcelas com `dueDate` em meses seguintes.
- Query: filtrar por `dueDate` ou por `closingDate` conforme definição do ciclo (ex.: fatura atual = tudo que vence entre hoje e o próximo dueDay).

Implementação sugerida em `utils/installments.js` com funções puras testáveis e chamadas ao Firestore apenas na camada `api/`.

---

## 6. Regras de Segurança do Firestore

Princípio: **apenas membros do workspace** podem ler/escrever nos dados daquele workspace.

- Obter lista de workspace IDs onde o usuário é membro: não dá para fazer só com regras (requer query em `members`). Duas abordagens:
  - **A)** Cada documento em `workspaces/{id}` só é legível se existir `members/{userId}` com esse userId. Assim, o app só chama `getDoc(workspace)` para IDs que já conhece (por exemplo, de um documento `users/{uid}/workspaces` ou de uma query em um grupo de coleções).
  - **B)** Manter uma coleção `users/{uid}/workspaceIds` com lista de IDs (atualizada por Cloud Functions ao aceitar convite/criar workspace). As regras checam `get(/databases/$(database)/documents/users/$(request.auth.uid)/workspaceIds/$(workspaceId)).data != null`.

Abordagem mais simples **sem Cloud Functions**: usar subcoleções sempre sob `workspaces/{workspaceId}` e exigir que, para qualquer operação em `workspaces/{workspaceId}/...`, exista o documento `workspaces/{workspaceId}/members/{request.auth.uid}`.

Arquivo completo de regras está em `firestore.rules` na raiz do projeto.

---

## 7. Plano de Desenvolvimento por Etapas

Ver documento **[DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)**.

---

## 8. Sugestões de Melhorias Futuras

- **TypeScript:** Migrar projeto e models para TS.
- **Cloud Functions:** Sincronizar `currentBalance` das contas ao criar/editar transações; gerar parcelas de assinaturas mensalmente; enviar e-mail de convite; notificações de vencimento.
- **PWA:** Service worker e cache para uso offline.
- **Exportação:** CSV/PDF de transações e relatórios.
- **Metas:** Metas de economia com progresso e alertas.
- **Conciliação bancária:** Importar OFX/CSV e conciliar com lançamentos manuais.
- **Permissões granulares:** Por conta (somente leitura em algumas contas).
- **Temas e acessibilidade:** Tema escuro e suporte a leitores de tela.
- **Testes:** Unit (utils, hooks) e integração (fluxos críticos com emuladores Firebase).

---

*Documento gerado como parte da arquitetura do sistema de controle financeiro pessoal.*
