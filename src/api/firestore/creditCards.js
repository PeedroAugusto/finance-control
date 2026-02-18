import {
  collection,
  doc,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase.js';

/**
 * @param {string} workspaceId
 * @returns {Promise<Array<{ id: string, name: string, closingDay: number, dueDay: number, limit?: number, isActive: boolean }>>}
 */
export async function getCreditCards(workspaceId) {
  const ref = collection(db, 'workspaces', workspaceId, 'creditCards');
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * @param {string} workspaceId
 * @param {{ name: string, closingDay: number, dueDay: number, limit?: number }}
 */
export async function createCreditCard(workspaceId, data) {
  const ref = collection(db, 'workspaces', workspaceId, 'creditCards');
  const docRef = await addDoc(ref, {
    name: data.name.trim(),
    closingDay: Number(data.closingDay) || 1,
    dueDay: Number(data.dueDay) || 10,
    limit: data.limit != null && data.limit !== '' ? Number(data.limit) : null,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: docRef.id };
}
