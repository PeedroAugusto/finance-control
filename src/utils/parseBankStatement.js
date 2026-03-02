import { parseCurrency } from './currency.js';

/**
 * Normaliza nome de coluna para comparação (minúsculo, sem acento, sem espaços extras).
 * @param {string} s
 * @returns {string}
 */
function normalizeHeader(s) {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tenta parsear data em formatos comuns (dd/MM/yyyy, dd-MM-yyyy, yyyy-MM-dd).
 * @param {string} str
 * @returns {Date | null}
 */
function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  // dd/MM/yyyy ou dd-MM-yyyy
  const br = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(trimmed);
  if (br) {
    const [, day, month, year] = br;
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // yyyy-MM-dd
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const [, year, month, day] = iso;
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Parseia valor numérico (BR: 1.234,56 ou -1.234,56; ou número simples).
 * Retorna número positivo para crédito e negativo para débito quando há colunas separadas.
 * @param {string} str
 * @returns {number}
 */
function parseAmount(str) {
  if (str == null || str === '') return 0;
  const s = String(str).trim();
  const neg = /^\-/.test(s) || s.includes('(');
  const num = parseCurrency(s.replace(/[()]/g, ''));
  return neg ? -Math.abs(num) : Math.abs(num);
}

/**
 * Detecta delimitador da primeira linha (vírgula ou ponto-e-vírgula).
 * @param {string} firstLine
 * @returns {',' | ';'}
 */
function detectDelimiter(firstLine) {
  const semicolon = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semicolon >= comma ? ';' : ',';
}

/**
 * Mapeia índice de coluna por nomes conhecidos (normalizados).
 */
const COLUMN_ALIASES = {
  date: ['data', 'data do lancamento', 'data lancamento', 'data movimentacao', 'data movimento', 'date', 'dt'],
  description: ['historico', 'historico do lancamento', 'descricao', 'descrição', 'memo', 'lancamento', 'observacao', 'observação', 'detalhe'],
  amount: ['valor', 'valor do lancamento', 'valor lancamento', 'valor movimento', 'amount', 'valor (r$)'],
  debit: ['debito', 'débito', 'deb', 'valor debito', 'saida', 'saída'],
  credit: ['credito', 'crédito', 'cred', 'valor credito', 'entrada'],
};

function findColumnIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const i = normalized.findIndex((h) => alias === h || h.includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Parseia conteúdo CSV de extrato bancário (formato FEBRABAN ou similar).
 * Retorna array de { date: Date, description: string, amount: number } (amount > 0 = entrada, < 0 = saída).
 *
 * @param {string} text Conteúdo do arquivo (CSV)
 * @returns {{ success: boolean, transactions: Array<{ date: Date, description: string, amount: number }>, error?: string }}
 */
export function parseCSV(text) {
  const transactions = [];
  if (!text || typeof text !== 'string') {
    return { success: false, transactions: [], error: 'Arquivo vazio ou inválido.' };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { success: false, transactions: [], error: 'O arquivo precisa ter cabeçalho e pelo menos uma linha de dados.' };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const dateIdx = findColumnIndex(headers, COLUMN_ALIASES.date);
  const descIdx = findColumnIndex(headers, COLUMN_ALIASES.description);
  const amountIdx = findColumnIndex(headers, COLUMN_ALIASES.amount);
  const debitIdx = findColumnIndex(headers, COLUMN_ALIASES.debit);
  const creditIdx = findColumnIndex(headers, COLUMN_ALIASES.credit);

  if (dateIdx < 0) {
    return { success: false, transactions: [], error: 'Coluna de data não encontrada. Use um CSV com cabeçalho (ex.: Data, Histórico, Valor).' };
  }

  const hasSeparateDebitCredit = debitIdx >= 0 || creditIdx >= 0;
  const hasSingleAmount = amountIdx >= 0 && !hasSeparateDebitCredit;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Ignorar linhas que parecem ser totais ou rodapé
    if (/^(total|saldo|situacao|data do arquivo)/i.test(line)) continue;

    const parts = splitCSVLine(line, delimiter);
    const dateStr = parts[dateIdx];
    const date = parseDate(dateStr);
    if (!date) continue;

    let amount = 0;
    if (hasSeparateDebitCredit) {
      const debitVal = debitIdx >= 0 ? parseAmount(parts[debitIdx]) : 0;
      const creditVal = creditIdx >= 0 ? parseAmount(parts[creditIdx]) : 0;
      if (debitVal !== 0 && creditVal !== 0) continue; // linha inválida
      amount = creditVal !== 0 ? Math.abs(creditVal) : -Math.abs(debitVal);
    } else if (hasSingleAmount) {
      amount = parseAmount(parts[amountIdx]);
      // Se o banco exporta só valor positivo e indica tipo em outra coluna, podemos não ter; assumir que valor negativo já vem com sinal
      if (amount === 0) continue;
    } else {
      continue;
    }

    const description = (descIdx >= 0 ? parts[descIdx] : '').trim() || 'Lançamento importado';
    transactions.push({
      date,
      description: description.slice(0, 500),
      amount,
    });
  }

  return { success: true, transactions };
}

/**
 * Divide uma linha CSV respeitando aspas (campo com vírgula dentro de aspas).
 * @param {string} line
 * @param {string} delimiter
 * @returns {string[]}
 */
function splitCSVLine(line, delimiter) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' || c === "'") {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === delimiter) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  parts.push(current.trim());
  return parts;
}

/**
 * Parseia arquivo OFX (extrato) e extrai transações.
 * @param {string} text Conteúdo do arquivo OFX
 * @returns {{ success: boolean, transactions: Array<{ date: Date, description: string, amount: number }>, error?: string }}
 */
export function parseOFX(text) {
  const transactions = [];
  if (!text || typeof text !== 'string') {
    return { success: false, transactions: [], error: 'Arquivo vazio ou inválido.' };
  }

  // OFX pode vir com ou sem XML header; tags são <STMTTRN>, <DTPOSTED>, <TRNAMT>, <MEMO>, <NAME>
  const stmtTrnBlocks = text.split(/<STMTTRN>/i);
  for (let i = 1; i < stmtTrnBlocks.length; i++) {
    const block = stmtTrnBlocks[i].split(/<\/STMTTRN>/i)[0] || '';
    const getTag = (tag) => {
      const re = new RegExp(`<${tag}>([^<]*)`, 'i');
      const m = block.match(re);
      return m ? m[1].trim() : '';
    };
    const dtPosted = getTag('DTPOSTED');
    const trnamt = getTag('TRNAMT');
    const memo = getTag('MEMO') || getTag('NAME') || getTag('FITID');
    if (!dtPosted || !trnamt) continue;

    // OFX date: 20231215120000 ou 20231215
    let date = null;
    const digits = dtPosted.replace(/\D/g, '');
    if (digits.length >= 8) {
      const y = parseInt(digits.slice(0, 4), 10);
      const m = parseInt(digits.slice(4, 6), 10) - 1;
      const d = parseInt(digits.slice(6, 8), 10);
      date = new Date(y, m, d);
    }
    if (!date || Number.isNaN(date.getTime())) continue;

    const amount = parseFloat(String(trnamt).replace(',', '.')) || 0;
    if (amount === 0) continue;

    transactions.push({
      date,
      description: (memo || 'Lançamento OFX').slice(0, 500),
      amount,
    });
  }

  if (transactions.length === 0) {
    return { success: false, transactions: [], error: 'Nenhuma transação encontrada no arquivo OFX.' };
  }
  return { success: true, transactions };
}

/**
 * Detecta tipo de arquivo pelo conteúdo e parseia.
 * @param {string} fileName
 * @param {string} text
 * @returns {{ success: boolean, transactions: Array<{ date: Date, description: string, amount: number }>, error?: string }}
 */
export function parseBankStatementFile(fileName, text) {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.ofx')) {
    return parseOFX(text);
  }
  return parseCSV(text);
}
