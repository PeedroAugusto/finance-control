/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {'income'|'expense'} type
 * @property {string} [color]
 * @property {string} [icon]
 * @property {boolean} isSystem
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/** @type {const} */
export const CATEGORY_TYPES = {
  income: 'income',
  expense: 'expense',
};
