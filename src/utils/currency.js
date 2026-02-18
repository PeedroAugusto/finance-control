/**
 * Formata valor em BRL.
 * @param {number} value
 * @param {Object} [options]
 * @returns {string}
 */
export function formatCurrency(value, options = {}) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    ...options,
  }).format(value);
}

/**
 * Converte string de valor (ex.: "1.234,56" ou "1234,56") para número.
 * @param {string} value
 * @returns {number}
 */
export function parseCurrency(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const cleaned = String(value).replace(/\D/g, '');
  const num = parseInt(cleaned, 10) / 100;
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Formata uma string de valor para exibição no padrão brasileiro (ex.: "20.304,03").
 * Útil após blur no campo de valor.
 * @param {string} value
 * @returns {string}
 */
export function formatCurrencyInput(value) {
  if (value == null || value === '') return '';
  const num = parseCurrency(value);
  const [intPart, decPart] = num.toFixed(2).split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${decPart}`;
}

/**
 * Converte um número (valor em reais, ex.: 500) para o formato do campo de valor (ex.: "500,00" ou "1.000,00").
 * Use ao preencher o formulário com valor vindo da API; não use formatCurrencyInput(num) pois ela trata a string como entrada do usuário e divide por 100.
 * @param {number} value
 * @returns {string}
 */
export function numberToCurrencyInput(value) {
  const num = Number(value);
  if (value == null || Number.isNaN(num)) return '';
  const [intPart, decPart] = num.toFixed(2).split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${decPart}`;
}
