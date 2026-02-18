import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './firebase.js';

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function register(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * @returns {Promise<void>}
 */
export async function logout() {
  return signOut(auth);
}

/**
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
