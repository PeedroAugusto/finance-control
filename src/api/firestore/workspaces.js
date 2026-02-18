import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';

/**
 * Cria um novo workspace e adiciona o criador como membro admin.
 * @param {string} userId - UID do usuário
 * @param {string} userEmail
 * @param {string} workspaceName
 * @returns {Promise<{ workspaceId: string }>}
 */
export async function createWorkspace(userId, userEmail, workspaceName) {
  const workspacesRef = collection(db, 'workspaces');
  const newRef = doc(workspacesRef);
  const workspaceId = newRef.id;

  const batch = writeBatch(db);

  batch.set(newRef, {
    name: workspaceName,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const memberRef = doc(db, 'workspaces', workspaceId, 'members', userId);
  batch.set(memberRef, {
    userId,
    email: userEmail,
    role: 'admin',
    joinedAt: serverTimestamp(),
  });

  const userWorkspaceRef = doc(db, 'users', userId, 'workspaceIds', workspaceId);
  batch.set(userWorkspaceRef, { workspaceId, addedAt: serverTimestamp() });

  await batch.commit();
  return { workspaceId };
}

/**
 * Lista os workspaces do usuário (via users/{uid}/workspaceIds).
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function getWorkspacesByUser(userId) {
  const ref = collection(db, 'users', userId, 'workspaceIds');
  const snap = await getDocs(ref);
  const ids = snap.docs.map((d) => d.data().workspaceId);
  if (ids.length === 0) return [];

  const list = [];
  for (const id of ids) {
    const wRef = doc(db, 'workspaces', id);
    const wSnap = await getDoc(wRef);
    if (wSnap.exists()) {
      list.push({ id: wSnap.id, ...wSnap.data(), name: wSnap.data().name });
    }
  }
  return list;
}

/**
 * Busca um workspace por ID (o usuário deve ser membro - regras do Firestore validam).
 * @param {string} workspaceId
 * @returns {Promise<{ id: string, name: string } | null>}
 */
export async function getWorkspace(workspaceId) {
  const ref = doc(db, 'workspaces', workspaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
