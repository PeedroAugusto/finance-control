import { parseCurrency } from './currency.js';

/**
 * Extrai texto de um PDF via pdfjs-dist e parseia linhas de extrato bancário.
 * Formato esperado: linhas com data (dd/mm ou dd/mm/yyyy), descrição e valor (BR: 1.234,56 ou -1.234,56).
 *
 * @param {ArrayBuffer} arrayBuffer Conteúdo do arquivo PDF
 * @returns {Promise<{ success: boolean, transactions: Array<{ date: Date, description: string, amount: number }>, error?: string }>}
 */
export async function parsePDF(arrayBuffer) {
  if (!arrayBuffer?.byteLength) {
    return { success: false, transactions: [], error: 'Arquivo PDF vazio ou inválido.' };
  }

  let pdfjsLib;
  try {
    pdfjsLib = await import('pdfjs-dist');
  } catch (e) {
    return { success: false, transactions: [], error: 'Não foi possível carregar o leitor de PDF.' };
  }

  // Worker para Vite: ?url retorna o caminho do asset
  try {
    const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    if (workerModule?.default) pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  } catch (_) {}

  const pageTexts = [];
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    console.log('[parsePDF] Total de páginas:', numPages);
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(' ');
      pageTexts.push(pageText);
      const preview = pageText.length > 1200 ? pageText.slice(0, 1200) + ' [...]' : pageText;
      console.log(`[parsePDF] Página ${pageNum} (${pageText.length} caracteres):`, preview);
    }
  } catch (e) {
    return { success: false, transactions: [], error: 'Erro ao ler o PDF: ' + (e.message || 'arquivo corrompido ou não suportado.') };
  }

  const allTransactions = [];
  let lastError = '';
  pageTexts.forEach((pageText, index) => {
    const result = parsePDFText(pageText);
    console.log(`[parsePDF] Página ${index + 1} parseada:`, result.transactions?.length ?? 0, 'transações', result.success ? '' : result.error);
    if (result.success && result.transactions.length > 0) {
      allTransactions.push(...result.transactions);
      console.log(`[parsePDF] Transações da página ${index + 1}:`, result.transactions);
    }
    if (result.error) lastError = result.error;
  });

  console.log('[parsePDF] Total de transações:', allTransactions.length, allTransactions);
  if (allTransactions.length === 0) {
    return { success: false, transactions: [], error: lastError || 'Nenhuma transação encontrada no PDF.' };
  }
  return { success: true, transactions: allTransactions };
}

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Extrai a data do período do cabeçalho (ex.: "28 a 28 de fevereiro de 2026" ou "28 de fevereiro 2026").
 * @param {string} text
 * @returns {Date | null}
 */
function parseStatementDateFromHeader(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();
  // "28 a 28 de fevereiro de 2026" ou "28 de fevereiro de 2026" ou "28 de fevereiro 2026"
  const withRange = /(\d{1,2})\s+a\s+\d{1,2}\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/.exec(t);
  if (withRange) {
    const [, day, monthName, year] = withRange;
    const monthIdx = MESES_PT.findIndex((m) => m.startsWith(monthName) || monthName.startsWith(m.replace('ç', 'c')));
    if (monthIdx >= 0) {
      const d = new Date(parseInt(year, 10), monthIdx, parseInt(day, 10));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const single = /(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/.exec(t);
  if (single) {
    const [, day, monthName, year] = single;
    const monthIdx = MESES_PT.findIndex((m) => m.startsWith(monthName) || monthName.startsWith(m.replace('ç', 'c')));
    if (monthIdx >= 0) {
      const d = new Date(parseInt(year, 10), monthIdx, parseInt(day, 10));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/**
 * Parseia extrato em formato tabular (ex.: Hora | Tipo | Origem/Destino | Valor com +R$ / -R$).
 * A data é obtida do cabeçalho do período.
 */
function parseTabularStatement(text) {
  const transactions = [];
  const statementDate = parseStatementDateFromHeader(text);
  const baseDate = statementDate || new Date();

  // Valor no formato +R$ 1.200,00 ou -R$ 31,47 ou R$ 1.200,00 (com ou sem R$)
  const valuePattern = /([+-])?R?\$?\s*(\d[\d.]*,\d{2})\b/g;
  let match;
  const valueMatches = [];
  while ((match = valuePattern.exec(text)) !== null) {
    const raw = match[0];
    const sign = match[1];
    const numStr = match[2];
    const amount = parseCurrency(numStr);
    if (amount === 0) continue;
    const isNegative = sign === '-' || raw.trimStart().startsWith('-');
    valueMatches.push({
      index: match.index,
      endIndex: match.index + raw.length,
      amount: isNegative ? -amount : amount,
      raw,
    });
  }

  // Palavras que indicam saída (débito); quando o PDF não traz o sinal, usamos o tipo para marcar como negativo
  const outflowKeywords = /compra\s+realizada|compra\s|d[eé]bito|pagamento|pix\s+enviado|sa[ií]da|transfer[eê]ncia\s+enviada|tarifa|boleto/i;

  // Alguns PDFs (ex.: Itaú) têm apenas um horário no cabeçalho (ex.: "18:29:07") e cada lançamento vem por data (DD/MM/AAAA),
  // então usar "último HH:MM" como âncora mistura várias linhas. Nesse caso, preferimos ancorar pela última data.
  const allTimes = [...text.matchAll(/\d{1,2}:\d{2}\b/g)];
  const allDates = [...text.matchAll(/\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)];
  const useDateMode = allDates.length > 10 && allTimes.length <= 2;

  for (let i = 0; i < valueMatches.length; i++) {
    const vm = valueMatches[i];
    const textBefore = text.slice(0, vm.index);
    const dateMatches = [...textBefore.matchAll(/\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)];
    const lastDate = dateMatches[dateMatches.length - 1];

    const timeMatches = useDateMode ? [] : [...textBefore.matchAll(/\d{1,2}:\d{2}\b/g)];
    const lastTime = timeMatches[timeMatches.length - 1];

    let blockStart = (useDateMode ? lastDate?.index : (lastTime?.index ?? lastDate?.index));
    if (blockStart == null) continue;
    let block = text.slice(blockStart, vm.index);
    if (!block.trim()) continue;

    const datesInBlock = [...block.matchAll(/\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)];
    if (datesInBlock.length > 1) {
      const lastDateInBlock = datesInBlock[datesInBlock.length - 1];
      block = block.slice(lastDateInBlock.index);
    }

    if (/\bsaldo\s+final\b|\bsaldo\s+ao\s+final\b|\bsaldo\s+do\s+per[ií]odo\b/i.test(block)) continue;
    if (/\bsaldo\s+do\s+dia\b/i.test(block)) continue;

    const dateAtStart = block.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    let rowDate = baseDate;
    if (dateAtStart) {
      const [, d, m, y] = dateAtStart;
      const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
      const dObj = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
      if (!Number.isNaN(dObj.getTime())) rowDate = dObj;
    }

    let description = block
      .replace(/\d{1,2}:\d{2}\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    description = description
      .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s+/, '') // remove data no início (ex.: "02/03/2026 PIX..." -> "PIX...")
      .replace(/\d{1,2}:\d{1,2}:\d{1,2}\s+data\s+lan[çc]amentos\s+valor\s*\(R\$\)\s+saldo\s*\(R\$\)\s*/gi, '')
      .replace(/^(Hora\s+)?Tipo\s+(Valor\s+)?Origem\s*\/\s*Destino\s+Forma de pagamento\s*(Valor\s*)?/i, '')
      .replace(/^(Hora\s+)?Tipo\s+Origem\s*\/\s*Destino\s+Forma de pagamento\s+Valor\s*/i, '')
      .replace(/^Valor\s*/i, '')
      .replace(/^\d{1,2}:\d{2}\s+/, '') // remove hora no início (ex.: "19:57 Pix recebido..." -> "Pix recebido...")
      .trim();
    if (description.length > 300) description = description.slice(-300);
    // Se a ordem veio "Nome HH:MM Tipo" (comum quando o PDF extrai colunas em ordem diferente), reordena para "Tipo Nome"
    const middleTime = description.match(/^(.+?)\s+(\d{1,2}:\d{2})\s+(.+)$/);
    if (middleTime) {
      const [, before, , after] = middleTime;
      description = `${after.trim()} ${before.trim()}`.trim();
    }
    if (!description) description = 'Lançamento';

    // Ignora só se a descrição for APENAS o cabeçalho (ex.: linha da tabela sem transação)
    const descNorm = description.toLowerCase().replace(/\s+/g, ' ');
    const isOnlyHeader =
      (descNorm.length < 60 && /^hora\s*tipo\s*(valor\s+)?origem\s*\/?\s*destino/i.test(descNorm)) ||
      (descNorm.length < 60 && descNorm.includes('forma de pagamento') && /(^|\s)valor\s*$/.test(descNorm));
    if (isOnlyHeader) continue;

    let amount = vm.amount;
    if (amount > 0 && outflowKeywords.test(block)) {
      amount = -Math.abs(amount);
    }

    transactions.push({
      date: rowDate,
      description: description.slice(0, 500),
      amount,
    });
  }

  return transactions;
}

/**
 * Estratégia para quando o PDF extrai texto em ordem de colunas (datas juntas, depois descrições, depois valores).
 * Divide o texto por segmentos que começam com DD/MM/YYYY e associa cada valor ao seu segmento.
 */
function parseByDateSegments(text) {
  const transactions = [];
  const normalized = text.replace(/\s+/g, ' ').trim();
  const segments = normalized.split(/(?=\d{1,2}\/\d{1,2}\/\d{2,4}\b)/);
  const valuePattern = /([+-])?R?\$?\s*(\d[\d.]*,\d{2})\b/g;
  const outflowKeywords = /compra\s+realizada|compra\s|d[eé]bito|pagamento|pix\s+enviado|sa[ií]da|tarifa|boleto/i;

  for (const seg of segments) {
    const segment = seg.trim();
    const dateMatch = segment.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (!dateMatch) continue;
    if (/\bsaldo\s+do\s+dia\b|\bsaldo\s+final\b|\bsaldo\s+ao\s+final\b|\bsaldo\s+do\s+per[ií]odo\b/i.test(segment)) continue;

    const valueMatches = [...segment.matchAll(valuePattern)];
    if (valueMatches.length === 0) continue;
    const match = valueMatches[valueMatches.length - 1];
    const raw = match[0];
    const sign = match[1];
    const numStr = match[2];
    const amount = parseCurrency(numStr);
    if (amount === 0) continue;
    const isNegative = sign === '-' || raw.trimStart().startsWith('-');
    let amountFinal = isNegative ? -amount : amount;
    if (amountFinal > 0 && outflowKeywords.test(segment)) amountFinal = -Math.abs(amountFinal);

    const [, d, m, y] = dateMatch;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    const rowDate = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
    if (Number.isNaN(rowDate.getTime())) continue;

    const beforeValue = segment.slice(0, match.index).replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*/, '').trim();
    const description = (beforeValue || 'Lançamento').slice(0, 500);

    transactions.push({ date: rowDate, description, amount: amountFinal });
  }
  return transactions;
}

/**
 * Parseia texto extraído de PDF (linhas com data, descrição e valor em formato BR).
 * Suporta: (1) linhas com data no início e valor no fim; (2) tabela com Hora, Tipo, Origem/Destino, Valor (+R$/‑R$).
 * @param {string} text
 * @returns {{ success: boolean, transactions: Array<{ date: Date, description: string, amount: number }>, error?: string }}
 */
export function parsePDFText(text) {
  const transactions = [];
  if (!text || typeof text !== 'string') {
    return { success: false, transactions: [], error: 'Nenhum texto no PDF.' };
  }

  const normalized = text.replace(/\s+/g, ' ').trim();

  // Estratégia 1: layout tabular (Hora, Tipo, Origem/Destino, Valor +R$ / -R$)
  let tabular = parseTabularStatement(normalized);
  if (tabular.length === 0) {
    tabular = parseByDateSegments(normalized);
  }
  if (tabular.length > 0) {
    return { success: true, transactions: tabular };
  }

  // Estratégia 2: linhas com data no início (dd/mm) e valor no fim
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const datePrefix = /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const amountSuffix = /(\(-?\d[\d.]*,\d{2}\)|-?\d[\d.]*,\d{2})\s*$/;
  const currentYear = new Date().getFullYear();

  for (const line of lines) {
    const dateMatch = line.match(datePrefix);
    const amountMatch = line.match(amountSuffix);
    if (!dateMatch || !amountMatch) continue;

    const [, d, m, y] = dateMatch;
    const year = y ? (y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10)) : currentYear;
    if (year < 1990 || year > 2100) continue;
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) continue;

    const amountStr = amountMatch[1].replace(/[()]/g, '').trim();
    const amount = parseCurrency(amountStr);
    if (amount === 0) continue;
    const isNegative = amountMatch[1].startsWith('-') || amountMatch[1].startsWith('(');
    const value = isNegative ? -Math.abs(amount) : amount;

    const descStart = dateMatch[0].length;
    const descEnd = line.length - amountMatch[0].length;
    const description = (line.slice(descStart, descEnd).trim() || 'Lançamento PDF').slice(0, 500);

    transactions.push({
      date,
      description,
      amount: value,
    });
  }

  if (transactions.length === 0) {
    return { success: false, transactions: [], error: 'Nenhuma transação encontrada no PDF. O layout pode não ser reconhecido.' };
  }
  return { success: true, transactions };
}
