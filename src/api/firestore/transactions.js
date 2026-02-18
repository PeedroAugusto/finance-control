import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { getAccounts, updateAccount } from './accounts.js';
import { generateInstallments } from '../../utils/installments.js';

function applyBalanceChange(accountMap, workspaceId, type, amount, accountId, targetAccountId, updateAccountFn) {
  const absAmount = Math.abs(Number(amount)) || 0;
  const updateBalance = async (accountId, delta) => {
    const acc = accountMap[accountId];
    if (!acc) return;
    const current = Number(acc.currentBalance) ?? Number(acc.initialBalance) ?? 0;
    await updateAccountFn(workspaceId, accountId, { currentBalance: current + delta });
  };
  switch (type) {
    case 'income':
    case 'yield':
      return updateBalance(accountId, absAmount);
    case 'expense':
    case 'investment':
      return updateBalance(accountId, -absAmount);
    case 'transfer':
      if (targetAccountId) {
        return Promise.all([
          updateBalance(accountId, -absAmount),
          updateBalance(targetAccountId, absAmount),
        ]);
      }
      return Promise.resolve();
    default:
      return Promise.resolve();
  }
}

/**
 * @param {string} workspaceId
 * @param {{ start?: Date, end?: Date, limitCount?: number }}
 * @returns {Promise<Array<{ id: string, type: string, amount: number, accountId: string, date: any, description?: string }>>}
 */
export async function getTransactions(workspaceId, opts = {}) {
  const ref = collection(db, 'workspaces', workspaceId, 'transactions');
  let q = query(ref, orderBy('date', 'desc'), limit(opts.limitCount ?? 100));
  const snap = await getDocs(q);
  let list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      date: data.date?.toDate?.() ?? data.date,
    };
  });
  if (opts.start || opts.end) {
    const start = opts.start?.getTime?.() ?? 0;
    const end = opts.end ? opts.end.getTime() : Number.MAX_SAFE_INTEGER;
    list = list.filter((t) => {
      const tDate = t.date?.getTime?.() ?? new Date(t.date).getTime();
      return tDate >= start && tDate <= end;
    });
  }
  return list;
}

/**
 * Busca todas as transações com date <= endDate (paginação), para cálculo de saldo no passado.
 * @param {string} workspaceId
 * @param {Date} endDate
 * @returns {Promise<Array<{ id: string, type: string, amount: number, accountId: string, date: any }>>}
 */
export async function getTransactionsUpToEnd(workspaceId, endDate) {
  const ref = collection(db, 'workspaces', workspaceId, 'transactions');
  const endTs = endDate?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  const toDoc = (d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      date: data.date?.toDate?.() ?? data.date,
    };
  };
  let lastDoc = null;
  let all = [];
  const limitCount = 5000;
  while (true) {
    const q = lastDoc
      ? query(ref, orderBy('date', 'desc'), limit(limitCount), startAfter(lastDoc))
      : query(ref, orderBy('date', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = snap.docs.map((d) => toDoc(d));
    all = all.concat(batch);
    const newestInBatch = batch[0];
    const newestTs = newestInBatch?.date?.getTime?.() ?? new Date(newestInBatch?.date).getTime();
    if (newestTs <= endTs) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  return all.filter((t) => {
    const tDate = t.date?.getTime?.() ?? new Date(t.date).getTime();
    return tDate <= endTs;
  });
}

/**
 * Cria transação e atualiza saldo da(s) conta(s).
 * @param {string} workspaceId
 * @param {string} userId
 * @param {{ type: string, amount: number, accountId: string, targetAccountId?: string, categoryId?: string, creditCardId?: string, description?: string, date: Date, isRecurring?: boolean, recurrenceFrequency?: string, skipBalanceUpdate?: boolean }}
 */
export async function createTransaction(workspaceId, userId, data) {
  const amount = Math.abs(Number(data.amount)) || 0;
  if (amount <= 0) throw new Error('Valor deve ser maior que zero.');

  const ref = collection(db, 'workspaces', workspaceId, 'transactions');
  const date = data.date instanceof Date ? data.date : new Date(data.date);
  const skipBalance = data.skipBalanceUpdate === true;
  const now = new Date();
  const isFuture = date.getTime() > now.getTime();

  const docRef = await addDoc(ref, {
    type: data.type,
    amount,
    accountId: data.accountId,
    targetAccountId: data.targetAccountId || null,
    categoryId: data.categoryId || null,
    creditCardId: data.creditCardId || null,
    description: (data.description || '').trim() || null,
    date: Timestamp.fromDate(date),
    creditCardPurchaseId: data.creditCardPurchaseId || null,
    installmentId: data.installmentId || null,
    installmentNumber: data.installmentNumber ?? null,
    isRecurring: data.isRecurring === true,
    recurrenceFrequency: data.recurrenceFrequency || null,
    appliedToBalance: !skipBalance && !isFuture,
    createdAt: serverTimestamp(),
    createdBy: userId,
    updatedAt: serverTimestamp(),
  });

  if (!skipBalance && !isFuture) {
    const accounts = await getAccounts(workspaceId);
    const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
    await applyBalanceChange(
      accountMap,
      workspaceId,
      data.type,
      amount,
      data.accountId,
      data.targetAccountId,
      updateAccount
    );
  }

  return { id: docRef.id };
}

/**
 * Cria várias transações para uma compra parcelada no cartão.
 * Parcelas com data futura não atualizam o saldo da conta (appliedToBalance: false).
 * @param {string} workspaceId
 * @param {string} userId
 * @param {{ totalAmount: number, installmentsCount: number, purchaseDate: Date, creditCardId: string, accountId: string, categoryId?: string, description: string, closingDay: number, dueDay: number }}
 */
export async function createInstallmentTransactions(workspaceId, userId, params) {
  const {
    totalAmount,
    installmentsCount,
    purchaseDate,
    creditCardId,
    accountId,
    categoryId,
    description,
    closingDay,
    dueDay,
  } = params;
  const date = purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate);
  const parcels = generateInstallments({
    totalAmount,
    installmentsCount,
    purchaseDate: date,
    closingDay: closingDay || 10,
    dueDay: dueDay || 10,
  });
  const now = new Date();
  let firstId = null;
  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    const isFuture = p.dueDate.getTime() > now.getTime();
    const res = await createTransaction(workspaceId, userId, {
      type: 'expense',
      amount: p.amount,
      accountId,
      categoryId: categoryId || undefined,
      creditCardId,
      description: `${(description || '').trim() || 'Parcelado'} (${p.number}/${parcels.length})`,
      date: p.dueDate,
      skipBalanceUpdate: isFuture,
      installmentNumber: p.number,
      creditCardPurchaseId: firstId || undefined,
    });
    if (i === 0) firstId = res.id;
  }
  if (firstId) {
    await updateDoc(doc(db, 'workspaces', workspaceId, 'transactions', firstId), {
      creditCardPurchaseId: firstId,
      installmentNumber: 1,
      updatedAt: serverTimestamp(),
    });
  }
  return { count: parcels.length, firstId };
}

/** Retorna o início do dia (00:00:00) em horário local para comparação só por data. */
function startOfDayLocal(d) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

/**
 * Aplica ao saldo as transações com data já vencida que ainda não foram aplicadas (ex.: parcelas no cartão).
 * Só aplica quando a data de vencimento (dia do calendário) é hoje ou anterior, para não debitar antes do vencimento.
 * @param {string} workspaceId
 */
export async function applyPendingTransactions(workspaceId) {
  const now = new Date();
  const todayStart = startOfDayLocal(now);
  const txs = await getTransactionsUpToEnd(workspaceId, now);
  const pending = txs.filter((t) => {
    if (t.appliedToBalance === true) return false;
    const tDate = t.date?.toDate?.() ?? t.date;
    const dueDate = tDate instanceof Date ? tDate : new Date(tDate);
    const dueDayStart = startOfDayLocal(dueDate);
    return dueDayStart.getTime() <= todayStart.getTime();
  });
  if (pending.length === 0) return;
  const ref = collection(db, 'workspaces', workspaceId, 'transactions');
  for (const tx of pending) {
    const accounts = await getAccounts(workspaceId);
    const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
    await applyBalanceChange(
      accountMap,
      workspaceId,
      tx.type,
      Number(tx.amount) || 0,
      tx.accountId,
      tx.targetAccountId,
      updateAccount
    );
    await updateDoc(doc(ref, tx.id), { appliedToBalance: true, updatedAt: serverTimestamp() });
  }
}

/**
 * @param {string} workspaceId
 * @param {string} transactionId
 */
export async function getTransaction(workspaceId, transactionId) {
  const ref = doc(db, 'workspaces', workspaceId, 'transactions', transactionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    date: data.date?.toDate?.() ?? data.date,
  };
}

/**
 * Reverte o efeito de uma transação nos saldos (usa o inverso do tipo).
 */
function revertBalanceChange(accountMap, workspaceId, tx, updateAccountFn) {
  const absAmount = Math.abs(Number(tx.amount)) || 0;
  const type = tx.type;
  const accountId = tx.accountId;
  const targetAccountId = tx.targetAccountId || null;
  const updateBalance = async (accountId, delta) => {
    const acc = accountMap[accountId];
    if (!acc) return;
    const current = Number(acc.currentBalance) ?? Number(acc.initialBalance) ?? 0;
    await updateAccountFn(workspaceId, accountId, { currentBalance: current + delta });
  };
  switch (type) {
    case 'income':
    case 'yield':
      return updateBalance(accountId, -absAmount);
    case 'expense':
    case 'investment':
      return updateBalance(accountId, absAmount);
    case 'transfer':
      if (targetAccountId) {
        return Promise.all([
          updateBalance(accountId, absAmount),
          updateBalance(targetAccountId, -absAmount),
        ]);
      }
      return Promise.resolve();
    default:
      return Promise.resolve();
  }
}

/**
 * Atualiza transação e recalcula saldos (reverte a antiga e aplica a nova).
 */
export async function updateTransaction(workspaceId, userId, transactionId, data) {
  const amount = Math.abs(Number(data.amount)) || 0;
  if (amount <= 0) throw new Error('Valor deve ser maior que zero.');

  const txRef = doc(db, 'workspaces', workspaceId, 'transactions', transactionId);
  const oldSnap = await getDoc(txRef);
  if (!oldSnap.exists()) throw new Error('Transação não encontrada.');

  const oldTx = { id: oldSnap.id, ...oldSnap.data(), date: oldSnap.data().date?.toDate?.() ?? oldSnap.data().date };
  const accounts = await getAccounts(workspaceId);
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  await revertBalanceChange(accountMap, workspaceId, oldTx, updateAccount);

  const date = data.date instanceof Date ? data.date : new Date(data.date);
  await updateDoc(txRef, {
    type: data.type,
    amount,
    accountId: data.accountId,
    targetAccountId: data.targetAccountId || null,
    categoryId: data.categoryId || null,
    creditCardId: data.creditCardId || null,
    description: (data.description || '').trim() || null,
    date: Timestamp.fromDate(date),
    updatedAt: serverTimestamp(),
  });

  const accountsAfter = await getAccounts(workspaceId);
  const mapAfter = Object.fromEntries(accountsAfter.map((a) => [a.id, a]));
  await applyBalanceChange(
    mapAfter,
    workspaceId,
    data.type,
    amount,
    data.accountId,
    data.targetAccountId,
    updateAccount
  );
}

/**
 * Exclui transação e reverte o efeito nos saldos.
 */
export async function deleteTransaction(workspaceId, transactionId) {
  const txRef = doc(db, 'workspaces', workspaceId, 'transactions', transactionId);
  const snap = await getDoc(txRef);
  if (!snap.exists()) throw new Error('Transação não encontrada.');

  const tx = { id: snap.id, ...snap.data(), date: snap.data().date?.toDate?.() ?? snap.data().date };
  const accounts = await getAccounts(workspaceId);
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  await revertBalanceChange(accountMap, workspaceId, tx, updateAccount);
  await deleteDoc(txRef);
}
