/**
 * Geração de parcelas para compras no cartão de crédito.
 * Funções puras para facilitar testes e uso na camada de API.
 */

/**
 * Ajusta o dia para o último dia do mês se o dia não existir (ex.: 31 em fevereiro).
 * @param {Date} date
 * @param {number} day
 * @returns {Date}
 */
function setDayOfMonth(date, day) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * Gera a data de vencimento da parcela N (1-based), considerando dueDay do cartão.
 * Parcela 1 = mês da compra, parcela 2 = mês seguinte, etc.
 * Usa dia 1 do mês para evitar bug: compra dia 31 + N meses vira "31/fev" → março (pula fevereiro).
 * @param {Date} purchaseDate - Data da compra
 * @param {number} installmentNumber - Número da parcela (1, 2, 3...)
 * @param {number} dueDay - Dia do vencimento da fatura (1-31)
 * @returns {Date}
 */
export function getInstallmentDueDate(purchaseDate, installmentNumber, dueDay) {
  const d = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1);
  d.setMonth(d.getMonth() + (installmentNumber - 1));
  return setDayOfMonth(d, dueDay);
}

/**
 * Retorna a data de fechamento da fatura em que a parcela entra.
 * A fatura que "fecha" no closingDay do mês M contém parcelas que vencem após esse fechamento (até o dueDay do mês M+1).
 * Para exibição: consideramos que a parcela entra na fatura cujo fechamento é no mês anterior ao vencimento.
 * @param {Date} dueDate - Data de vencimento da parcela
 * @param {number} closingDay - Dia de fechamento do cartão
 * @returns {Date}
 */
export function getClosingDateForDueDate(dueDate, closingDay) {
  const d = new Date(dueDate);
  // Fatura que reúne esta parcela fecha no mês anterior ao vencimento
  d.setMonth(d.getMonth() - 1);
  return setDayOfMonth(d, closingDay);
}

/**
 * Gera o array de parcelas para uma compra.
 * @param {Object} params
 * @param {number} params.totalAmount - Valor total da compra
 * @param {number} params.installmentsCount - Número de parcelas
 * @param {Date} params.purchaseDate - Data da compra
 * @param {number} params.closingDay - Dia de fechamento do cartão (1-31)
 * @param {number} params.dueDay - Dia de vencimento do cartão (1-31)
 * @returns {Array<{ number: number, amount: number, dueDate: Date, closingDate: Date }>}
 */
export function generateInstallments({ totalAmount, installmentsCount, purchaseDate, closingDay, dueDay }) {
  if (installmentsCount < 1) return [];
  const baseAmount = Math.floor((totalAmount / installmentsCount) * 100) / 100;
  const remainder = Math.round((totalAmount - baseAmount * installmentsCount) * 100) / 100;
  const parcels = [];
  for (let i = 1; i <= installmentsCount; i++) {
    const amount = i === installmentsCount ? baseAmount + remainder : baseAmount;
    const dueDate = getInstallmentDueDate(purchaseDate, i, dueDay);
    const closingDate = getClosingDateForDueDate(dueDate, closingDay);
    parcels.push({
      number: i,
      amount,
      dueDate,
      closingDate,
    });
  }
  return parcels;
}

/**
 * Separa parcelas em "fatura atual" e "fatura futura" com base na data de referência.
 * Fatura atual: parcelas que vencem no ciclo atual (ex.: até o próximo dueDay a partir de today).
 * @param {Array<{ dueDate: Date, closingDate: Date, amount: number, number: number, status?: string }>} installments
 * @param {Date} today - Data de referência (geralmente new Date())
 * @param {number} dueDay - Dia de vencimento
 * @returns {{ current: typeof installments, future: typeof installments }}
 */
export function splitCurrentAndFutureInvoices(installments, today, dueDay) {
  const current = [];
  const future = [];
  for (const inst of installments) {
    const due = inst.dueDate instanceof Date ? inst.dueDate : inst.dueDate.toDate?.() ?? new Date(inst.dueDate);
    const ref = new Date(today.getFullYear(), today.getMonth(), dueDay);
    if (due <= ref) {
      current.push(inst);
    } else {
      future.push(inst);
    }
  }
  return { current, future };
}
