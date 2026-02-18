/**
 * @typedef {Object} CreditCard
 * @property {string} id
 * @property {string} name
 * @property {number} closingDay
 * @property {number} dueDay
 * @property {number} [limit]
 * @property {boolean} isActive
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} CreditCardPurchase
 * @property {string} id
 * @property {string} description
 * @property {string} categoryId
 * @property {number} totalAmount
 * @property {import('firebase/firestore').Timestamp} purchaseDate
 * @property {'single'|'installments'|'recurring'} type
 * @property {number} installmentsCount
 * @property {string} [recurringInterval]
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} Installment
 * @property {string} id
 * @property {number} number
 * @property {number} amount
 * @property {import('firebase/firestore').Timestamp} dueDate
 * @property {import('firebase/firestore').Timestamp} closingDate
 * @property {'pending'|'paid'|'overdue'} status
 * @property {import('firebase/firestore').Timestamp} [paidAt]
 * @property {string} [transactionId]
 */

/** @type {const} */
export const PURCHASE_TYPES = {
  single: 'single',
  installments: 'installments',
  recurring: 'recurring',
};

/** @type {const} */
export const INSTALLMENT_STATUS = {
  pending: 'pending',
  paid: 'paid',
  overdue: 'overdue',
};
