/**
 * @typedef {Object} Workspace
 * @property {string} id
 * @property {string} name
 * @property {string} createdBy
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} WorkspaceMember
 * @property {string} userId
 * @property {string} email
 * @property {'admin'|'member'} role
 * @property {import('firebase/firestore').Timestamp} joinedAt
 * @property {string} [invitedBy]
 */

export const WORKSPACE_ROLES = /** @type {const} */ ({ admin: 'admin', member: 'member' });
