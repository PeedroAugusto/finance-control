/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {'bank'|'digital_wallet'|'cash'|'investment'} type
 * @property {number} initialBalance
 * @property {number} currentBalance
 * @property {number} [yieldRate]
 * @property {string} [yieldReference]
 * @property {string} [color]
 * @property {boolean} isActive
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/** @type {const} */
export const ACCOUNT_TYPES = {
  bank: 'bank',
  digital_wallet: 'digital_wallet',
  cash: 'cash',
  investment: 'investment',
};
