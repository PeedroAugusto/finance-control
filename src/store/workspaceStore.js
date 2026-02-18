import { create } from 'zustand';

/** @typedef {{ id: string, name: string } | null} Workspace */

/**
 * @typedef {Object} WorkspaceState
 * @property {Workspace} current
 * @property {Array<{ id: string, name: string }>} list
 * @property {boolean} loading
 * @property {(workspace: Workspace) => void} setCurrent
 * @property {(list: Array<{ id: string, name: string }>) => void} setList
 * @property {() => void} clear
 */

/** @type {import('zustand').UseBoundStore<WorkspaceState>} */
export const useWorkspaceStore = create((set) => ({
  current: null,
  list: [],
  loading: false,

  setCurrent: (workspace) => set({ current: workspace }),
  setList: (list) => set({ list }),
  setLoading: (loading) => set({ loading }),

  clear: () => set({ current: null, list: [] }),
}));
