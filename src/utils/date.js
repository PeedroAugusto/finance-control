/**
 * Helpers de data (podem ser substituídos por date-fns depois).
 */

/**
 * @param {Date} date
 * @returns {string} YYYY-MM
 */
export function getYearMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Primeiro dia do mês (00:00:00).
 * @param {Date} date
 * @returns {Date}
 */
export function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Último dia do mês (23:59:59.999).
 * @param {Date} date
 * @returns {Date}
 */
export function endOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}
