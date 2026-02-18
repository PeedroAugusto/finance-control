/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {'income'|'expense'|'transfer'|'investment'|'yield'} type
 * @property {number} amount
 * @property {string} accountId
 * @property {string} [targetAccountId]
 * @property {string} [categoryId]
 * @property {string} [description]
 * @property {import('firebase/firestore').Timestamp} date
 * @property {string} [creditCardPurchaseId]
 * @property {string} [installmentId]
 * @property {boolean} isRecurring
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {string} createdBy
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/** @type {const} */
export const TRANSACTION_TYPES = {
  income: 'income',
  expense: 'expense',
  transfer: 'transfer',
  investment: 'investment',
  yield: 'yield',
};
