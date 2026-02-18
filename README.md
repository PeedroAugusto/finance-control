# Controle Financeiro Pessoal

Sistema web responsivo de controle financeiro pessoal com suporte a múltiplos usuários e compartilhamento de dados (workspaces).

## Stack

- **Frontend:** React + Vite  
- **Backend:** Firebase (Authentication + Firestore)  
- **Estado global:** Context API ou Zustand  
- **Gráficos:** Recharts  

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura completa: modelagem Firestore, estrutura de pastas, entidades, fluxo de autenticação, estratégia de parcelas e melhorias futuras |
| [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) | Plano de desenvolvimento por etapas (fases 0 a 7) |
| [docs/FIRESTORE_RULES.md](docs/FIRESTORE_RULES.md) | Referência das regras de segurança do Firestore |

## Estrutura do repositório

- `firestore.rules` — Regras de segurança do Firestore  
- `firestore.indexes.json` — Índices compostos  
- `src/models/` — Entidades (workspace, account, category, transaction, creditCard)  
- `src/utils/` — Utilitários (parcelas, moeda, data)  

## Como começar

1. Configurar projeto no [Firebase Console](https://console.firebase.google.com): ativar Authentication (Email/Password) e Firestore.
2. Copiar `.env.example` para `.env` e preencher as variáveis do Firebase.
3. Instalar dependências e rodar o app (após implementar as fases do plano):

   ```bash
   npm install
   npm run dev
   ```

4. Publicar regras e índices (com Firebase CLI):

   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

## Deploy no Netlify

1. Conecte o repositório ao Netlify (Site settings → Build & deploy).
2. O `netlify.toml` já define: comando `npm run build` e pasta `dist`.
3. **Variáveis de ambiente** (obrigatórias): em Site settings → Environment variables, adicione as mesmas do Firebase que você usa no `.env` local:

   | Nome | Descrição |
   |------|------------|
   | `VITE_FIREBASE_API_KEY` | API Key do projeto Firebase |
   | `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain (ex: `seu-projeto.firebaseapp.com`) |
   | `VITE_FIREBASE_PROJECT_ID` | ID do projeto |
   | `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket (ex: `seu-projeto.appspot.com`) |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
   | `VITE_FIREBASE_APP_ID` | App ID |

   Valores estão no Firebase Console → Project settings → Your apps → config do app web.

4. No Firebase Console, em Authentication → Settings → Authorized domains, adicione o domínio do Netlify (ex: `seu-site.netlify.app`).

5. Faça o deploy (manual ou por push no repositório).

## Funcionalidades (visão geral)

- **Saldo:** Múltiplas contas, saldo inicial, rendimento (ex.: 102% CDI), simulação mensal/anual  
- **Cartão de crédito:** Compras (única, parcelada, assinatura), parcelas automáticas, fatura atual/futura, valor pago/restante  
- **Transações:** Entrada, saída, transferência, investimento, rendimento; filtros por mês, categoria e conta  
- **Dashboard:** Saldo total, gastos/receitas do mês, fatura atual, próximos vencimentos, gráficos por categoria e evolução do patrimônio  
- **Workspaces:** Criar workspace, convidar por e-mail, compartilhar contas e transações; permissões (admin/membro) preparadas  

Consulte [ARCHITECTURE.md](docs/ARCHITECTURE.md) e [DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) para detalhes e ordem de implementação.
