import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const DEFAULT_CATEGORIES = [
  { name: 'Alimentação', type: 'expense' },
  { name: 'Transporte', type: 'expense' },
  { name: 'Moradia', type: 'expense' },
  { name: 'Saúde', type: 'expense' },
  { name: 'Educação', type: 'expense' },
  { name: 'Lazer', type: 'expense' },
  { name: 'Planos', type: 'expense' },
  { name: 'Compras', type: 'expense' },
  { name: 'Outros (despesa)', type: 'expense' },
  { name: 'Salário', type: 'income' },
  { name: 'Freelance', type: 'income' },
  { name: 'Investimentos', type: 'income' },
  { name: 'Outros (receita)', type: 'income' },
];

/**
 * @param {string} workspaceId
 * @returns {Promise<Array<{ id: string, name: string, type: string }>>}
 */
export async function getCategories(workspaceId) {
  const ref = collection(db, 'workspaces', workspaceId, 'categories');
  const snap = await getDocs(ref);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Remove duplicatas por (name, type) para não repetir na UI (ex.: seed rodou 2x)
  const seen = new Set();
  return list.filter((c) => {
    const key = `${c.name ?? ''}|${c.type ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Garante que o workspace tenha todas as categorias padrão.
 * Insere apenas as que ainda não existem (por nome + tipo), para não duplicar e para preencher faltantes.
 * @param {string} workspaceId
 */
export async function seedDefaultCategories(workspaceId) {
  const existing = await getCategories(workspaceId);
  const existingKeys = new Set(existing.map((c) => `${c.name ?? ''}|${c.type ?? ''}`));
  const ref = collection(db, 'workspaces', workspaceId, 'categories');
  for (const cat of DEFAULT_CATEGORIES) {
    const key = `${cat.name}|${cat.type}`;
    if (existingKeys.has(key)) continue;
    await addDoc(ref, {
      name: cat.name,
      type: cat.type,
      isSystem: true,
      createdAt: serverTimestamp(),
    });
    existingKeys.add(key);
  }
}
