import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase.js';

/**
 * @param {string} workspaceId
 * @returns {Promise<Array<{ id: string, name: string, type: string, initialBalance: number, currentBalance: number, isActive: boolean }>>}
 */
export async function getAccounts(workspaceId) {
  const ref = collection(db, 'workspaces', workspaceId, 'accounts');
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * @param {string} workspaceId
 * @param {{ name: string, type: string, initialBalance: number, yieldRate?: number, yieldReference?: string }}
 */
export async function createAccount(workspaceId, data) {
  const ref = collection(db, 'workspaces', workspaceId, 'accounts');
  const initial = Number(data.initialBalance) || 0;
  const docRef = await addDoc(ref, {
    name: data.name.trim(),
    type: data.type,
    initialBalance: initial,
    currentBalance: initial,
    yieldRate: data.yieldRate != null ? Number(data.yieldRate) : null,
    yieldReference: data.yieldReference?.trim() || null,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: docRef.id };
}

/**
 * @param {string} workspaceId
 * @param {string} accountId
 * @param {{ name?: string, isActive?: boolean, currentBalance?: number }}
 */
export async function updateAccount(workspaceId, accountId, data) {
  const ref = doc(db, 'workspaces', workspaceId, 'accounts', accountId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
