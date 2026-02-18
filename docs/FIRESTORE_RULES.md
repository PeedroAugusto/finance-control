# Referência das Regras de Segurança do Firestore

Arquivo principal: **`/firestore.rules`** na raiz do projeto.

## Princípio

- **Apenas usuários autenticados** podem acessar dados.
- **Apenas membros do workspace** podem ler ou escrever em qualquer subcoleção desse workspace (`workspaces/{workspaceId}/...`).

## Funções auxiliares (nas regras)

| Função | Descrição |
|--------|-----------|
| `isAuthenticated()` | `request.auth != null` |
| `isMember(workspaceId)` | Existe documento `workspaces/{workspaceId}/members/{request.auth.uid}` |
| `isAdmin(workspaceId)` | O documento em `members/{uid}` tem `role == 'admin'` |

## Resumo por coleção

| Caminho | Leitura | Criação | Atualização | Exclusão |
|---------|---------|---------|-------------|----------|
| `workspaces/{id}` | Membro | Autenticado | Membro | Membro |
| `workspaces/{id}/members/{memberId}` | Membro | Criador (si mesmo) ou membro (convite) | Membro (próprio) ou Admin | Membro (próprio) ou Admin |
| `workspaces/{id}/accounts/*` | Membro | Membro | Membro | Membro |
| `workspaces/{id}/categories/*` | Membro | Membro | Membro | Membro |
| `workspaces/{id}/creditCards/*` | Membro | Membro | Membro | Membro |
| `.../purchases/*` | Membro | Membro | Membro | Membro |
| `.../installments/*` | Membro | Membro | Membro | Membro |
| `workspaces/{id}/transactions/*` | Membro | Membro | Membro | Membro |
| `workspaces/{id}/invitations/*` | Membro | Membro | Membro | Membro |
| `users/{uid}/workspaceIds/*` | Dono (uid == auth.uid) | Dono | Dono | Dono |

## Fluxo recomendado no app

1. **Criar workspace:**  
   - `setDoc(workspaces/{id}, { name, createdBy: auth.uid, ... })`  
   - Em seguida: `setDoc(workspaces/{id}/members/{auth.uid}, { userId, email, role: 'admin', ... })`

2. **Listar workspaces do usuário:**  
   - Opção A: manter `users/{uid}/workspaceIds/{workspaceId}` e ler essa subcoleção.  
   - Opção B: não há query “onde sou membro” direta; manter lista de IDs no cliente (ex.: ao aceitar convite, adicionar ao store e gravar em `users/{uid}/workspaceIds`).

3. **Todas as operações de dados** (contas, transações, cartão, etc.): usar sempre o `workspaceId` atual do store e paths `workspaces/{workspaceId}/...`. As regras garantem que só membros acessem.

## Deploy das regras

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

(Requer Firebase CLI e projeto configurado.)
