import { create } from 'zustand';
import { subscribeAuth, login as apiLogin, register as apiRegister, logout as apiLogout } from '../api/auth.js';

/** @typedef {{ uid: string, email: string | null } | null} User */

/**
 * @typedef {Object} AuthState
 * @property {User} user
 * @property {boolean} loading
 * @property {boolean} initialized
 * @property {(email: string, password: string) => Promise<void>} login
 * @property {(email: string, password: string) => Promise<void>} register
 * @property {() => Promise<void>} logout
 * @property {() => void} setInitialized
 */

/** @type {import('zustand').UseBoundStore<AuthState>} */
export const useAuthStore = create((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  setInitialized: (value) => set({ initialized: value }),

  login: async (email, password) => {
    set({ loading: true });
    try {
      await apiLogin(email, password);
    } finally {
      set({ loading: false });
    }
  },

  register: async (email, password) => {
    set({ loading: true });
    try {
      await apiRegister(email, password);
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await apiLogout();
      get().clearWorkspace();
    } finally {
      set({ loading: false });
    }
  },

  clearWorkspace: () => {
    import('./workspaceStore.js').then((m) => m.useWorkspaceStore.getState().clear());
  },
}));

subscribeAuth((firebaseUser) => {
  useAuthStore.setState({
    user: firebaseUser
      ? { uid: firebaseUser.uid, email: firebaseUser.email || null }
      : null,
    initialized: true,
  });
});
