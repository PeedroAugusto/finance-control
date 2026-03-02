/**
 * Usa um modelo de zero-shot classification (Hugging Face Transformers.js) no browser
 * para sugerir categorias a partir da descrição da transação.
 * Modelo leve e gratuito, roda localmente sem API key.
 */

let classifierPromise = null;

/**
 * Carrega o pipeline de zero-shot uma vez (lazy).
 * Usa modelo pequeno para rodar no browser.
 * @returns {Promise<import('@huggingface/transformers').ZeroShotClassificationPipeline>}
 */
async function getClassifier() {
  if (classifierPromise) return classifierPromise;
  try {
    const { pipeline } = await import('@huggingface/transformers');
    // Modelo leve; para português pode não ser perfeito, mas labels em PT ajudam
    classifierPromise = pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli', {
      progress_callback: () => {},
    });
    return classifierPromise;
  } catch (e) {
    classifierPromise = null;
    throw new Error('Não foi possível carregar o modelo de IA. Verifique sua conexão.');
  }
}

/**
 * Sugere categoria para uma transação com base na descrição.
 * @param {string} description
 * @param {Array<{ id: string, name: string }>} candidateCategories
 * @returns {Promise<string | null>} categoryId ou null
 */
async function suggestCategoryForOne(description, candidateCategories) {
  if (!description?.trim() || candidateCategories.length === 0) return null;
  const labels = candidateCategories.map((c) => c.name);
  if (labels.length === 0) return null;
  const classifier = await getClassifier();
  const result = await classifier(description.trim().slice(0, 512), labels, {
    multi_label: false,
  });
  const topLabel = result?.labels?.[0];
  if (!topLabel) return null;
  const found = candidateCategories.find((c) => c.name === topLabel);
  return found ? found.id : null;
}

/**
 * Sugere categorias para uma lista de transações.
 * Entrada/saída é definida pelo sinal do amount; usa lista de categorias de receita ou despesa.
 *
 * @param {Array<{ date: Date, description: string, amount: number }>} transactions
 * @param {{ expense: Array<{ id: string, name: string }>, income: Array<{ id: string, name: string }> }} categoriesByType
 * @param {{ onProgress?: (current: number, total: number) => void }} options
 * @returns {Promise<Array<{ date: Date, description: string, amount: number, suggestedCategoryId?: string | null }>>}
 */
export async function suggestCategories(transactions, categoriesByType, options = {}) {
  const { onProgress } = options;
  const result = [];
  const total = transactions.length;
  for (let i = 0; i < total; i++) {
    const tx = transactions[i];
    const isIncome = (tx.amount || 0) >= 0;
    const candidates = isIncome ? categoriesByType.income : categoriesByType.expense;
    let suggestedCategoryId = null;
    if (candidates?.length > 0 && tx.description?.trim()) {
      try {
        suggestedCategoryId = await suggestCategoryForOne(tx.description, candidates);
      } catch (_) {
        // ignora erro por transação (ex.: modelo falhou)
      }
    }
    result.push({
      ...tx,
      suggestedCategoryId: suggestedCategoryId ?? undefined,
    });
    if (onProgress) onProgress(i + 1, total);
  }
  return result;
}
