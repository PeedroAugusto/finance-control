import { useState, useEffect, useRef, Fragment } from 'react';
import { useAuthStore } from '../../../store/authStore.js';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { getAccounts } from '../../../api/firestore/accounts.js';
import { getCategories, seedDefaultCategories } from '../../../api/firestore/categories.js';
import { getCreditCards } from '../../../api/firestore/creditCards.js';
import {
  getTransactions,
  createTransaction,
  createInstallmentTransactions,
  applyPendingTransactions,
  updateTransaction,
  deleteTransaction,
  getTransaction,
} from '../../../api/firestore/transactions.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { CurrencyInput } from '../../../components/ui/CurrencyInput.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Toggle } from '../../../components/ui/Toggle.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';
import { ConfirmModal } from '../../../components/ui/ConfirmModal.jsx';
import { TRANSACTION_TYPES } from '../../../models/transaction.js';
import { formatCurrency, parseCurrency, formatCurrencyInput, numberToCurrencyInput } from '../../../utils/currency.js';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';
import { parseBankStatementFile } from '../../../utils/parseBankStatement.js';
import { parsePDF } from '../../../utils/parsePDF.js';
import { suggestCategories } from '../../../utils/suggestCategories.js';

const TYPE_LABELS = {
  [TRANSACTION_TYPES.income]: 'Entrada',
  [TRANSACTION_TYPES.expense]: 'Saída',
  [TRANSACTION_TYPES.transfer]: 'Transferência',
  [TRANSACTION_TYPES.investment]: 'Investimento',
  [TRANSACTION_TYPES.yield]: 'Rendimento',
};

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'this_year', label: 'Este ano' },
];

function getDateRange(period) {
  const now = new Date();
  switch (period) {
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now), limitCount: 150 };
    case 'last_month':
      const last = subMonths(now, 1);
      return { start: startOfMonth(last), end: endOfMonth(last), limitCount: 150 };
    case 'this_year':
      return { start: startOfYear(now), end: endOfYear(now), limitCount: 800 };
    default:
      return {};
  }
}

const TypeIcon = ({ type }) => {
  const isIn = type === 'income' || type === 'yield';
  const className = `h-5 w-5 shrink-0 ${isIn ? 'text-emerald-500' : 'text-red-500'}`;
  if (type === 'transfer') {
    return (
      <svg className="h-5 w-5 shrink-0 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    );
  }
  if (type === 'investment') {
    return (
      <svg className="h-5 w-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6 6" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isIn ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' : 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6'} />
    </svg>
  );
};

const IconTransactions = ({ className = '' }) => (
  <svg className={`h-6 w-6 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
const IconUpload = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const IconPlus = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);
const IconCalendar = () => (
  <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const IconTag = () => (
  <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);
const IconFilter = () => (
  <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);
const IconSearch = () => (
  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const IconWallet = ({ className = 'text-slate-500' }) => (
  <svg className={`h-5 w-5 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const IconFile = ({ className = 'text-slate-300' }) => (
  <svg className={`h-12 w-12 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconSparkles = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);
const IconImport = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const RECURRENCE_OPTIONS = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
];

const emptyForm = (accounts) => ({
  type: TRANSACTION_TYPES.expense,
  accountId: accounts[0]?.id ?? '',
  targetAccountId: '',
  categoryId: '',
  creditCardId: '',
  isCreditCard: false,
  isRecurring: false,
  recurrenceFrequency: 'monthly',
  isInstallments: false,
  installmentsCount: 2,
  amount: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  description: '',
});

export function Transactions() {
  const { user } = useAuthStore();
  const { current } = useWorkspaceStore();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [creditCards, setCreditCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => emptyForm([]));
  const [periodFilter, setPeriodFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [createStep, setCreateStep] = useState(1);
  const createIntentRef = useRef(false);
  const [expandedInstallmentGroups, setExpandedInstallmentGroups] = useState(() => new Set());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importParsed, setImportParsed] = useState(null);
  const [importAccountId, setImportAccountId] = useState('');
  const [importTargetAccountId, setImportTargetAccountId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuggesting, setImportSuggesting] = useState(false);
  const [importSuggestProgress, setImportSuggestProgress] = useState({ current: 0, total: 0 });
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!current?.id) return;
    setLoading(true);
    const opts = periodFilter === 'all' ? { limitCount: 100 } : { ...getDateRange(periodFilter) };
    applyPendingTransactions(current.id)
      .then(() =>
        Promise.all([
          getTransactions(current.id, opts),
          getAccounts(current.id),
          getCategories(current.id).then(async (list) => {
            await seedDefaultCategories(current.id);
            return getCategories(current.id);
          }),
          getCreditCards(current.id),
        ])
      )
      .then(([txs, accs, cats, cards]) => {
        setTransactions(txs);
        setAccounts(accs);
        setCategories(cats);
        setCreditCards(cards);
      })
      .finally(() => setLoading(false));
  }, [current?.id, periodFilter]);

  const refresh = async () => {
    if (!current?.id) return;
    const opts = periodFilter === 'all' ? { limitCount: 100 } : { ...getDateRange(periodFilter) };
    const [txs, accs] = await Promise.all([getTransactions(current.id, opts), getAccounts(current.id)]);
    setTransactions(txs);
    setAccounts(accs);
  };

  const handleOpenModal = () => {
    setError('');
    setForm(emptyForm(accounts));
    setCreateStep(1);
    createIntentRef.current = false;
    setModalOpen(true);
  };

  const handleOpenImportModal = () => {
    setImportError('');
    setImportFile(null);
    setImportParsed(null);
    setImportAccountId(accounts[0]?.id ?? '');
    setImportTargetAccountId('');
    setImportModalOpen(true);
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setImportError('');
    setImportParsed(null);
    setImportFile(file || null);
    if (!file) return;
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith('.pdf');
    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      try {
        const result = await parsePDF(arrayBuffer);
        if (result.success) {
          setImportParsed(result);
          if (!importAccountId && accounts[0]?.id) setImportAccountId(accounts[0].id);
        } else {
          setImportError(result.error || 'Não foi possível ler o PDF.');
        }
      } catch (err) {
        setImportError(err.message || 'Erro ao processar o PDF.');
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result || '';
      const result = parseBankStatementFile(file.name, text);
      if (result.success) {
        setImportParsed(result);
        if (!importAccountId && accounts[0]?.id) setImportAccountId(accounts[0].id);
      } else {
        setImportError(result.error || 'Não foi possível ler o arquivo.');
      }
    };
    reader.onerror = () => setImportError('Erro ao ler o arquivo.');
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleImportSuggestCategories = async () => {
    if (!importParsed?.transactions?.length || importSuggesting) return;
    setImportError('');
    setImportSuggesting(true);
    setImportSuggestProgress({ current: 0, total: importParsed.transactions.length });
    try {
      const expenseCats = categories.filter((c) => c.type === 'expense').map((c) => ({ id: c.id, name: c.name }));
      const incomeCats = categories.filter((c) => c.type === 'income').map((c) => ({ id: c.id, name: c.name }));
      const enriched = await suggestCategories(
        importParsed.transactions,
        { expense: expenseCats, income: incomeCats },
        { onProgress: (current, total) => setImportSuggestProgress({ current, total }) }
      );
      setImportParsed((prev) => (prev ? { ...prev, transactions: enriched } : null));
    } catch (err) {
      setImportError(err.message || 'Erro ao sugerir categorias com IA.');
    } finally {
      setImportSuggesting(false);
      setImportSuggestProgress({ current: 0, total: 0 });
    }
  };

  const setImportRowCategory = (index, categoryId) => {
    setImportParsed((prev) => {
      if (!prev?.transactions?.length) return prev;
      const next = [...prev.transactions];
      next[index] = { ...next[index], categoryId: categoryId || undefined };
      return { ...prev, transactions: next };
    });
  };

  const setImportRowDescription = (index, description) => {
    setImportParsed((prev) => {
      if (!prev?.transactions?.length) return prev;
      const next = [...prev.transactions];
      next[index] = { ...next[index], description: description ?? '' };
      return { ...prev, transactions: next };
    });
  };

  const setImportRowType = (index, type) => {
    setImportParsed((prev) => {
      if (!prev?.transactions?.length) return prev;
      const next = [...prev.transactions];
      next[index] = { ...next[index], type: type || undefined, categoryId: undefined, suggestedCategoryId: undefined };
      return { ...prev, transactions: next };
    });
  };

  const setImportRowAmount = (index, valueStr) => {
    const amount = parseCurrency(valueStr);
    setImportParsed((prev) => {
      if (!prev?.transactions?.length) return prev;
      const next = [...prev.transactions];
      next[index] = { ...next[index], amount: amount };
      return { ...prev, transactions: next };
    });
  };

  const setImportRowDate = (index, dateStr) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return;
    setImportParsed((prev) => {
      if (!prev?.transactions?.length) return prev;
      const next = [...prev.transactions];
      next[index] = { ...next[index], date: d };
      return { ...prev, transactions: next };
    });
  };

  const handleImportSubmit = async () => {
    if (!importParsed?.transactions?.length || !importAccountId || !current?.id || !user?.uid) {
      setImportError('Selecione a conta e um arquivo de extrato válido.');
      return;
    }
    setImporting(true);
    setImportError('');
    try {
      for (const row of importParsed.transactions) {
        const type = row.type ?? (row.amount >= 0 ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense);
        const amount = Math.abs(Number(row.amount)) || 0;
        if (amount <= 0) continue;
        const categoryId = row.categoryId ?? row.suggestedCategoryId ?? undefined;
        const targetAccountId = type === TRANSACTION_TYPES.transfer ? importTargetAccountId || undefined : undefined;
        if (type === TRANSACTION_TYPES.transfer && !targetAccountId) {
          setImportError('Para transferências, selecione a conta de destino.');
          setImporting(false);
          return;
        }
        await createTransaction(current.id, user.uid, {
          type,
          amount,
          accountId: importAccountId,
          targetAccountId,
          categoryId,
          description: row.description || undefined,
          date: row.date,
        });
      }
      setImportModalOpen(false);
      setImportFile(null);
      setImportParsed(null);
      await refresh();
    } catch (err) {
      setImportError(err.message || 'Erro ao importar transações.');
    } finally {
      setImporting(false);
    }
  };

  const isExpenseType = form.type === 'expense' || form.type === 'investment';
  const showPaymentStep = isExpenseType && createStep === 3;
  const maxCreateStep = isExpenseType ? 3 : 2;

  const handleOpenEdit = async (tx) => {
    setError('');
    setEditingGroup(null);
    setEditingId(tx.id);
    const full = await getTransaction(current.id, tx.id);
    if (!full) return;
    setForm({
      type: full.type,
      accountId: full.accountId ?? '',
      targetAccountId: full.targetAccountId ?? '',
      categoryId: full.categoryId ?? '',
      creditCardId: full.creditCardId ?? '',
      isCreditCard: !!full.creditCardId,
      isRecurring: !!full.isRecurring,
      recurrenceFrequency: full.recurrenceFrequency ?? 'monthly',
      isInstallments: false,
      installmentsCount: 2,
      amount: numberToCurrencyInput(full.amount ?? 0),
      date: full.date ? format(full.date instanceof Date ? full.date : new Date(full.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      description: full.description ?? '',
    });
    setEditModalOpen(true);
  };

  const handleOpenEditGroup = (group) => {
    setError('');
    setEditingId(null);
    setEditingGroup(group);
    const first = group.transactions[0];
    if (!first) return;
    setForm({
      type: first.type,
      accountId: first.accountId ?? '',
      targetAccountId: first.targetAccountId ?? '',
      categoryId: first.categoryId ?? '',
      creditCardId: first.creditCardId ?? '',
      isCreditCard: !!first.creditCardId,
      isRecurring: !!first.isRecurring,
      recurrenceFrequency: first.recurrenceFrequency ?? 'monthly',
      isInstallments: false,
      installmentsCount: 2,
      amount: numberToCurrencyInput(group.totalAmount ?? 0),
      date: first.date ? format(first.date instanceof Date ? first.date : new Date(first.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      description: (first.description || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim() || '',
    });
    setEditModalOpen(true);
  };

  const handleCloseEdit = () => {
    setEditModalOpen(false);
    setEditingId(null);
    setEditingGroup(null);
  };

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');
  const formCategories =
    form.type === 'income' || form.type === 'yield' ? incomeCategories : expenseCategories;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modalOpen && (createStep !== maxCreateStep || !createIntentRef.current)) return;
    createIntentRef.current = false;
    setError('');
    const amount = parseCurrency(form.amount) || 0;
    if (amount <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    if (!form.accountId) {
      setError('Selecione a conta.');
      return;
    }
    if (form.type === 'transfer' && !form.targetAccountId) {
      setError('Selecione a conta de destino.');
      return;
    }
    if (form.type === 'expense' && form.isInstallments && form.isCreditCard) {
      if (!form.creditCardId) {
        setError('Selecione o cartão para compra parcelada.');
        return;
      }
      const card = creditCards.find((c) => c.id === form.creditCardId);
      if (!card) {
        setError('Cartão não encontrado.');
        return;
      }
    }
    if (!current?.id || !user?.uid) return;
    setSaving(true);
    try {
      if (form.type === 'expense' && form.isInstallments && form.isCreditCard && form.creditCardId) {
        const card = creditCards.find((c) => c.id === form.creditCardId);
        await createInstallmentTransactions(current.id, user.uid, {
          totalAmount: amount,
          installmentsCount: form.installmentsCount || 2,
          purchaseDate: new Date(form.date),
          creditCardId: form.creditCardId,
          accountId: form.accountId,
          categoryId: form.categoryId || undefined,
          description: form.description || '',
          closingDay: card?.closingDay ?? 10,
          dueDay: card?.dueDay ?? 10,
        });
      } else {
        await createTransaction(current.id, user.uid, {
          type: form.type,
          amount,
          accountId: form.accountId,
          targetAccountId: form.type === 'transfer' ? form.targetAccountId : undefined,
          categoryId: form.categoryId || undefined,
          creditCardId: form.type === 'expense' && form.creditCardId ? form.creditCardId : undefined,
          description: form.description || undefined,
          date: new Date(form.date),
          isRecurring: form.type === 'expense' && form.isRecurring,
          recurrenceFrequency: form.isRecurring ? form.recurrenceFrequency : undefined,
        });
      }
      setModalOpen(false);
      await refresh();
    } catch (err) {
      setError(err.message || 'Erro ao criar transação.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.accountId || !current?.id || !user?.uid) return;
    if (form.type === 'transfer' && !form.targetAccountId) {
      setError('Selecione a conta de destino.');
      return;
    }
    setSaving(true);
    try {
      if (editingGroup) {
        const shared = {
          type: form.type,
          accountId: form.accountId,
          targetAccountId: form.type === 'transfer' ? form.targetAccountId : undefined,
          categoryId: form.categoryId || undefined,
          creditCardId: form.type === 'expense' && form.creditCardId ? form.creditCardId : undefined,
          description: form.description || undefined,
        };
        for (const tx of editingGroup.transactions) {
          const amount = Number(tx.amount) || 0;
          const date = tx.date instanceof Date ? tx.date : new Date(tx.date);
          if (amount <= 0) continue;
          await updateTransaction(current.id, user.uid, tx.id, {
            ...shared,
            amount,
            date,
          });
        }
      } else {
        const amount = parseCurrency(form.amount) || 0;
        if (amount <= 0) {
          setError('Informe um valor maior que zero.');
          setSaving(false);
          return;
        }
        if (!editingId) return;
        await updateTransaction(current.id, user.uid, editingId, {
          type: form.type,
          amount,
          accountId: form.accountId,
          targetAccountId: form.type === 'transfer' ? form.targetAccountId : undefined,
          categoryId: form.categoryId || undefined,
          creditCardId: form.type === 'expense' && form.creditCardId ? form.creditCardId : undefined,
          description: form.description || undefined,
          date: new Date(form.date),
        });
      }
      handleCloseEdit();
      await refresh();
    } catch (err) {
      setError(err.message || 'Erro ao atualizar transação.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (tx) => {
    setGroupToDelete(null);
    setTransactionToDelete(tx);
    setDeleteModalOpen(true);
  };

  const handleDeleteGroupClick = (group) => {
    setTransactionToDelete(null);
    setGroupToDelete(group);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!current?.id) return;
    setSaving(true);
    try {
      if (groupToDelete) {
        for (const tx of groupToDelete.transactions) {
          await deleteTransaction(current.id, tx.id);
        }
        setDeleteModalOpen(false);
        setGroupToDelete(null);
      } else if (transactionToDelete) {
        await deleteTransaction(current.id, transactionToDelete.id);
        setDeleteModalOpen(false);
        setTransactionToDelete(null);
      }
      await refresh();
    } catch (err) {
      setError(err.message || 'Erro ao excluir.');
    } finally {
      setSaving(false);
    }
  };

  const getAccountName = (id) => accounts.find((a) => a.id === id)?.name ?? '';
  const getCardName = (id) => creditCards.find((c) => c.id === id)?.name ?? '';
  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name ?? '';

  const filteredTransactions = transactions.filter((tx) => {
    if (categoryFilter && tx.categoryId !== categoryFilter) return false;
    if (typeFilter && tx.type !== typeFilter) return false;
    return true;
  });

  const installmentGroupsMap = {};
  const standaloneTransactions = [];
  filteredTransactions.forEach((tx) => {
    if (tx.creditCardPurchaseId) {
      const key = tx.creditCardPurchaseId;
      if (!installmentGroupsMap[key]) installmentGroupsMap[key] = [];
      installmentGroupsMap[key].push(tx);
    } else {
      standaloneTransactions.push(tx);
    }
  });
  const installmentGroups = Object.entries(installmentGroupsMap)
    .map(([purchaseId, txs]) => {
      const sorted = [...txs].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
      const first = sorted[0];
      const totalAmount = sorted.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const baseDesc = (first?.description || 'Parcelado').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim() || 'Parcelado';
      const sortDate = first?.date ? (first.date?.getTime?.() ?? new Date(first.date).getTime()) : 0;
      return { purchaseId, transactions: sorted, totalAmount, baseDescription: baseDesc, sortDate };
    })
    .filter((g) => g.transactions.length > 0);
  const displayItems = [
    ...standaloneTransactions.map((tx) => ({ type: 'standalone', transaction: tx, sortDate: tx.date?.getTime?.() ?? new Date(tx.date).getTime() })),
    ...installmentGroups.map((g) => ({ type: 'group', ...g })),
  ].sort((a, b) => (b.sortDate || 0) - (a.sortDate || 0));

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredDisplayItems = searchLower
    ? displayItems.filter((item) => {
        if (item.type === 'standalone') {
          const text = (item.transaction.description || TYPE_LABELS[item.transaction.type] || '').toLowerCase();
          return text.includes(searchLower);
        }
        const text = (item.baseDescription || 'Parcelado').toLowerCase();
        return text.includes(searchLower);
      })
    : displayItems;

  const totalFiltered = filteredDisplayItems.reduce((sum, item) => {
    if (item.type === 'standalone') {
      const tx = item.transaction;
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income' || tx.type === 'yield') return sum + amt;
      if (tx.type === 'expense' || tx.type === 'investment') return sum - amt;
      return sum;
    }
    return sum - (Number(item.totalAmount) || 0);
  }, 0);

  const toggleInstallmentGroup = (purchaseId) => {
    setExpandedInstallmentGroups((prev) => {
      const next = new Set(prev);
      if (next.has(purchaseId)) next.delete(purchaseId);
      else next.add(purchaseId);
      return next;
    });
  };

  const categoryOptions = [
    { value: '', label: 'Todas as categorias' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];
  const typeOptions = [
    { value: '', label: 'Todos os tipos' },
    ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
  ];

  const createStep1 = (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">O que você está registrando?</p>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
        <Select
          value={form.type}
          onChange={(value) => setForm((f) => ({ ...f, type: value }))}
          options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Valor (R$)</label>
        <CurrencyInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="0,00" />
      </div>
    </div>
  );

  const createStep2 = (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Onde e quando?</p>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Conta</label>
        <Select
          value={form.accountId}
          onChange={(value) => setForm((f) => ({ ...f, accountId: value }))}
          options={(accounts || []).map((a) => ({ value: a.id, label: a.name }))}
          placeholder="Selecione"
        />
      </div>
      {form.type === 'transfer' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Conta de destino</label>
          <Select
            value={form.targetAccountId}
            onChange={(value) => setForm((f) => ({ ...f, targetAccountId: value }))}
            options={(accounts || []).filter((a) => a.id !== form.accountId).map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Selecione"
          />
        </div>
      )}
      {(form.type === 'income' || form.type === 'expense' || form.type === 'yield' || form.type === 'investment') && formCategories.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label>
          <Select
            value={form.categoryId}
            onChange={(value) => setForm((f) => ({ ...f, categoryId: value }))}
            options={formCategories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Opcional"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Data</label>
        <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Descrição (opcional)</label>
        <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex: Supermercado" />
      </div>
    </div>
  );

  const createStep3 = (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Como foi o pagamento?</p>
      {creditCards.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <span className="text-sm font-medium text-slate-700">Foi no cartão de crédito?</span>
          <Toggle
            checked={form.isCreditCard}
            onChange={(v) => setForm((f) => ({ ...f, isCreditCard: v, creditCardId: v ? f.creditCardId : '', isInstallments: v ? f.isInstallments : false }))}
          />
        </div>
      )}
      {form.isCreditCard && creditCards.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Qual cartão?</label>
          <Select
            value={form.creditCardId}
            onChange={(value) => setForm((f) => ({ ...f, creditCardId: value }))}
            options={creditCards.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Selecione o cartão"
          />
        </div>
      )}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <span className="text-sm font-medium text-slate-700">Cobrança recorrente? (ex.: assinatura)</span>
        <Toggle checked={form.isRecurring} onChange={(v) => setForm((f) => ({ ...f, isRecurring: v }))} />
      </div>
      {form.isRecurring && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Repetir</label>
          <Select
            value={form.recurrenceFrequency}
            onChange={(value) => setForm((f) => ({ ...f, recurrenceFrequency: value }))}
            options={RECURRENCE_OPTIONS}
          />
        </div>
      )}
      {form.isCreditCard && (
        <>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <span className="text-sm font-medium text-slate-700">Compra parcelada?</span>
            <Toggle
              checked={form.isInstallments}
              onChange={(v) => setForm((f) => ({ ...f, isInstallments: v, installmentsCount: v ? f.installmentsCount : 2 }))}
            />
          </div>
          {form.isInstallments && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Número de parcelas</label>
              <Select
                value={String(form.installmentsCount)}
                onChange={(value) => setForm((f) => ({ ...f, installmentsCount: parseInt(value, 10) || 2 }))}
                options={Array.from({ length: 23 }, (_, i) => i + 2).map((n) => ({ value: String(n), label: `${n}x` }))}
              />
            </div>
          )}
        </>
      )}
    </div>
  );

  const formFields = (
    <>
      {createStep === 1 && createStep1}
      {createStep === 2 && createStep2}
      {createStep === 3 && createStep3}
    </>
  );

  const editFormFields = (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
        <Select value={form.type} onChange={(value) => setForm((f) => ({ ...f, type: value }))} options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Conta</label>
        <Select value={form.accountId} onChange={(value) => setForm((f) => ({ ...f, accountId: value }))} options={(accounts || []).map((a) => ({ value: a.id, label: a.name }))} placeholder="Selecione" />
      </div>
      {form.type === 'transfer' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Conta de destino</label>
          <Select value={form.targetAccountId} onChange={(value) => setForm((f) => ({ ...f, targetAccountId: value }))} options={(accounts || []).filter((a) => a.id !== form.accountId).map((a) => ({ value: a.id, label: a.name }))} placeholder="Selecione" />
        </div>
      )}
      {(form.type === 'income' || form.type === 'expense' || form.type === 'yield' || form.type === 'investment') && formCategories.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label>
          <Select value={form.categoryId} onChange={(value) => setForm((f) => ({ ...f, categoryId: value }))} options={formCategories.map((c) => ({ value: c.id, label: c.name }))} placeholder="Opcional" />
        </div>
      )}
      {form.type === 'expense' && creditCards.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Cartão de crédito</label>
          <Select value={form.creditCardId} onChange={(value) => setForm((f) => ({ ...f, creditCardId: value }))} options={creditCards.map((c) => ({ value: c.id, label: c.name }))} placeholder="Nenhum" />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Valor (R$)</label>
        <CurrencyInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="0,00" disabled={!!editingGroup} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Data</label>
        <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required disabled={!!editingGroup} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Descrição (opcional)</label>
        <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex: Supermercado" />
      </div>
    </>
  );

  const handleCreateNext = () => {
    if (createStep === 1) {
      const amount = parseCurrency(form.amount) || 0;
      if (amount <= 0) {
        setError('Informe o valor.');
        return;
      }
      setError('');
      setCreateStep(2);
    } else if (createStep === 2 && isExpenseType) {
      if (!form.accountId) {
        setError('Selecione a conta.');
        return;
      }
      if (form.type === 'transfer' && !form.targetAccountId) {
        setError('Selecione a conta de destino.');
        return;
      }
      setError('');
      setCreateStep(3);
    }
  };

  const createModalTitle = createStep === 1 ? 'Nova transação' : createStep === 2 ? 'Nova transação — Onde e quando?' : 'Nova transação — Como foi o pagamento?';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white shadow-sm">
              <IconTransactions className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Transações</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Entradas, saídas, transferências e investimentos. Vincule despesas ao cartão quando quiser.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleOpenImportModal} disabled={accounts.length === 0} title="Importar extrato CSV, OFX ou PDF do banco" className="inline-flex items-center gap-2">
            <IconUpload />
            Importar extrato
          </Button>
          <Button onClick={handleOpenModal} disabled={accounts.length === 0} className="inline-flex items-center gap-2">
            <IconPlus />
            Nova transação
          </Button>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-200/50 transition-all duration-300 ease-out">
          <div className="flex items-center gap-2">
            <IconCalendar />
            <Select
              value={periodFilter}
              onChange={setPeriodFilter}
              options={PERIOD_OPTIONS}
              className="min-w-[140px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <IconTag />
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              className="min-w-[160px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <IconFilter />
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOptions}
              className="min-w-[140px]"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-3 text-slate-400">
                <IconSearch />
              </span>
              <label htmlFor="tx-search" className="sr-only">Buscar por nome ou descrição</label>
              <Input
                id="tx-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="min-w-[200px] max-w-[280px] pl-10"
              />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-200/60">
              <IconWallet className="text-slate-500" />
              <span className={`font-semibold tabular-nums ${totalFiltered >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalFiltered >= 0 ? '+' : ''}{formatCurrency(totalFiltered)}
              </span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton mb-4 h-10 w-64 rounded-xl" />
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 md:px-6">
              <div className="skeleton h-4 w-40" />
            </div>
            <div className="divide-y divide-slate-100 p-4 md:px-6">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />
                    <div className="space-y-1">
                      <div className="skeleton h-4 w-44" />
                      <div className="skeleton h-3 w-24 md:hidden" />
                    </div>
                  </div>
                  <div className="skeleton h-5 w-20 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/60 px-8 py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <IconWallet className="text-amber-700" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Nenhuma conta</h3>
          <p className="mt-2 max-w-sm text-slate-600">
            Crie pelo menos uma <strong>conta</strong> na aba Contas para poder registrar transações.
          </p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-8 py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200/80 text-slate-600">
            <IconTransactions className="text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Nenhuma transação</h3>
          <p className="mt-2 max-w-sm text-slate-600">
            Clique em <strong>Nova transação</strong> para registrar sua primeira entrada ou saída.
          </p>
          <Button onClick={handleOpenModal} className="mt-4 inline-flex items-center gap-2">
            <IconPlus />
            Nova transação
          </Button>
        </div>
      ) : filteredDisplayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-8 py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200/80 text-slate-600">
            <IconFilter />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Nenhum resultado</h3>
          <p className="mt-2 max-w-sm text-slate-600">
            Nenhuma transação corresponde aos filtros. Tente outro período, categoria, tipo ou busca.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 md:px-6">
            <IconTransactions className="text-slate-500" />
            <p className="text-sm font-medium text-slate-600">
              {filteredDisplayItems.length} {filteredDisplayItems.length === 1 ? 'transação' : 'transações'}
              {(categoryFilter || typeFilter || periodFilter !== 'all' || searchQuery.trim()) && ' (filtradas)'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="py-3 pl-4 pr-2 md:pl-6">Descrição</th>
                  <th className="hidden py-3 px-2 md:table-cell">Data</th>
                  <th className="hidden py-3 px-2 lg:table-cell">Tipo</th>
                  <th className="hidden py-3 px-2 lg:table-cell">Conta</th>
                  <th className="py-3 pl-2 pr-4 text-right md:pr-6">Valor</th>
                  <th className="w-20 py-3 pr-4 md:pr-6" aria-label="Ações" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDisplayItems.map((item) => {
                  if (item.type === 'standalone') {
                    const tx = item.transaction;
                    return (
                      <tr key={tx.id} className="group transition hover:bg-slate-50/80">
                        <td className="py-3 pl-4 pr-2 md:pl-6">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-slate-200/80">
                              <TypeIcon type={tx.type} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{tx.description || TYPE_LABELS[tx.type] || tx.type}</p>
                              <div className="mt-0.5 flex flex-wrap gap-1 md:hidden">
                                <span className="text-xs text-slate-500">{tx.date && format(tx.date instanceof Date ? tx.date : new Date(tx.date), 'dd/MM/yyyy')}</span>
                                {getAccountName(tx.accountId) && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{getAccountName(tx.accountId)}</span>}
                                {tx.creditCardId && getCardName(tx.creditCardId) && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{getCardName(tx.creditCardId)}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden py-3 px-2 text-sm text-slate-600 md:table-cell">{tx.date && format(tx.date instanceof Date ? tx.date : new Date(tx.date), 'dd/MM/yyyy')}</td>
                        <td className="hidden py-3 px-2 lg:table-cell">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{TYPE_LABELS[tx.type]}</span>
                          {getCategoryName(tx.categoryId) && <span className="ml-1.5 inline-block text-xs text-slate-500">{getCategoryName(tx.categoryId)}</span>}
                        </td>
                        <td className="hidden py-3 px-2 text-sm text-slate-600 lg:table-cell">
                          {getAccountName(tx.accountId) || '—'}
                          {tx.creditCardId && getCardName(tx.creditCardId) && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{getCardName(tx.creditCardId)}</span>}
                        </td>
                        <td className="py-3 pl-2 pr-2 text-right md:pr-4">
                          <span className={`font-semibold tabular-nums ${tx.type === 'income' || tx.type === 'yield' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {tx.type === 'income' || tx.type === 'yield' ? '+' : '−'}
                            {formatCurrency(tx.amount ?? 0)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 md:pr-6">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => handleOpenEdit(tx)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-sky-600" title="Editar">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button type="button" onClick={() => handleDeleteClick(tx)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Excluir">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  const { purchaseId, transactions: groupTxs, totalAmount, baseDescription } = item;
                  const isExpanded = expandedInstallmentGroups.has(purchaseId);
                  const firstTx = groupTxs[0];
                  return (
                    <Fragment key={purchaseId}>
                      <tr
                        className="group transition hover:bg-slate-50/80"
                        onClick={() => toggleInstallmentGroup(purchaseId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInstallmentGroup(purchaseId); } }}
                        aria-expanded={isExpanded}
                      >
                        <td className="py-3 pl-4 pr-2 md:pl-6">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </span>
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-slate-200/80">
                              <TypeIcon type={firstTx?.type || 'expense'} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{baseDescription} · {groupTxs.length}x</p>
                              <div className="mt-0.5 flex flex-wrap gap-1 md:hidden">
                                <span className="text-xs text-slate-500">{groupTxs.length} parcelas</span>
                                {firstTx?.creditCardId && getCardName(firstTx.creditCardId) && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{getCardName(firstTx.creditCardId)}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden py-3 px-2 text-sm text-slate-600 md:table-cell">{groupTxs.length} parcelas</td>
                        <td className="hidden py-3 px-2 lg:table-cell">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{TYPE_LABELS[firstTx?.type] || 'Saída'}</span>
                          {getCategoryName(firstTx?.categoryId) && <span className="ml-1.5 inline-block text-xs text-slate-500">{getCategoryName(firstTx.categoryId)}</span>}
                        </td>
                        <td className="hidden py-3 px-2 text-sm text-slate-600 lg:table-cell">
                          {getAccountName(firstTx?.accountId) || '—'}
                          {firstTx?.creditCardId && getCardName(firstTx.creditCardId) && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{getCardName(firstTx.creditCardId)}</span>}
                        </td>
                        <td className="py-3 pl-2 pr-2 text-right md:pr-4">
                          <span className="font-semibold tabular-nums text-red-600">−{formatCurrency(totalAmount)}</span>
                        </td>
                        <td className="py-3 pr-4 md:pr-6" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => handleOpenEditGroup(item)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-sky-600" title="Editar parcelado">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button type="button" onClick={() => handleDeleteGroupClick(item)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Excluir parcelado">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <span className="text-xs text-slate-400">{isExpanded ? 'Recolher' : 'Expandir'}</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && groupTxs.map((tx) => (
                        <tr key={tx.id} className="bg-slate-50/80 transition hover:bg-slate-100/80">
                          <td className="py-2 pl-4 pr-2 md:pl-6">
                            <div className="flex items-center gap-3 pl-8">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200/80">
                                <TypeIcon type={tx.type} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-800">{tx.description || TYPE_LABELS[tx.type]}</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden py-2 px-2 text-sm text-slate-600 md:table-cell">{tx.date && format(tx.date instanceof Date ? tx.date : new Date(tx.date), 'dd/MM/yyyy')}</td>
                          <td className="hidden py-2 px-2 lg:table-cell">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{TYPE_LABELS[tx.type]}</span>
                            {getCategoryName(tx.categoryId) && <span className="ml-1 text-xs text-slate-500">{getCategoryName(tx.categoryId)}</span>}
                          </td>
                          <td className="hidden py-2 px-2 text-sm text-slate-600 lg:table-cell">{getAccountName(tx.accountId) || '—'}</td>
                          <td className="py-2 pl-2 pr-2 text-right md:pr-4">
                            <span className="text-sm font-semibold tabular-nums text-red-600">−{formatCurrency(tx.amount ?? 0)}</span>
                          </td>
                          <td className="py-2 pr-4 md:pr-6" />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={createModalTitle}>
        <form id="create-tx-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4 flex gap-1" role="progressbar" aria-valuenow={createStep} aria-valuemin={1} aria-valuemax={maxCreateStep} aria-label={`Etapa ${createStep} de ${maxCreateStep}`}>
            {Array.from({ length: maxCreateStep }, (_, i) => i + 1).map((s) => (
              <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= createStep ? 'bg-sky-500' : 'bg-slate-200'}`} aria-hidden />
            ))}
          </div>
          {formFields}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            {createStep > 1 && (
              <Button type="button" variant="secondary" onClick={() => { setError(''); setCreateStep(createStep - 1); }}>
                Voltar
              </Button>
            )}
            {createStep < maxCreateStep ? (
              <Button type="button" onClick={handleCreateNext}>
                Continuar
              </Button>
            ) : (
              <Button
                type="button"
                disabled={saving}
                onClick={() => { createIntentRef.current = true; document.getElementById('create-tx-form')?.requestSubmit(); }}
              >
                {saving ? 'Salvando...' : 'Criar transação'}
              </Button>
            )}
          </div>
        </form>
      </Modal>

      <Modal open={editModalOpen} onClose={handleCloseEdit} title={editingGroup ? 'Editar compra parcelada' : 'Editar transação'}>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editingGroup && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
              Serão atualizados descrição, categoria, conta e cartão para todas as {editingGroup.transactions.length} parcelas. Valores e datas de vencimento de cada parcela não são alterados.
            </p>
          )}
          {editFormFields}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleCloseEdit}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setTransactionToDelete(null); setGroupToDelete(null); }}
        onConfirm={handleConfirmDelete}
        title={groupToDelete ? 'Excluir compra parcelada' : 'Excluir transação'}
        message={groupToDelete
          ? `Excluir todas as ${groupToDelete.transactions.length} parcelas desta compra? O saldo da(s) conta(s) será ajustado. Esta ação não pode ser desfeita.`
          : 'Esta ação não pode ser desfeita. O saldo da(s) conta(s) será ajustado.'}
        confirmLabel="Excluir"
        variant="danger"
        loading={saving}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,.ofx,.pdf"
        className="hidden"
        onChange={handleImportFileChange}
        aria-label="Selecionar arquivo de extrato"
      />
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <IconUpload />
            </span>
            Importar extrato bancário
          </span>
        }
        contentClassName="max-w-6xl min-h-[70vh]"
      >
        <div className="space-y-5 min-w-0">
          <p className="text-sm text-slate-600">
            Selecione um arquivo de extrato (CSV, OFX ou PDF) exportado do seu banco. Opcionalmente, use a IA para sugerir categorias antes de importar.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={`w-full rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
              importFile
                ? 'border-sky-200 bg-sky-50/50 hover:border-sky-300'
                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/50'
            }`}
          >
            {importFile ? (
              <span className="flex items-center justify-center gap-2 text-sky-700">
                <IconFile className="text-sky-500" />
                <span className="font-medium">{importFile.name || 'Arquivo selecionado'}</span>
              </span>
            ) : (
              <span className="flex flex-col items-center gap-2 text-slate-500">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/60">
                  <IconUpload />
                </span>
                <span className="font-medium text-slate-600">Clique ou arraste o arquivo aqui</span>
                <span className="text-xs">CSV, OFX ou PDF</span>
              </span>
            )}
          </button>
          {importParsed?.transactions?.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Conta para importar</label>
                  <Select
                    value={importAccountId}
                    onChange={setImportAccountId}
                    options={(accounts || []).map((a) => ({ value: a.id, label: a.name }))}
                    placeholder="Selecione a conta"
                  />
                </div>
                {importParsed?.transactions?.some((r) => r.type === TRANSACTION_TYPES.transfer) && (
                  <div className="min-w-[180px]">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Conta destino (transferências)</label>
                    <Select
                      value={importTargetAccountId}
                      onChange={setImportTargetAccountId}
                      options={(accounts || []).filter((a) => a.id !== importAccountId).map((a) => ({ value: a.id, label: a.name }))}
                      placeholder="Selecione"
                    />
                  </div>
                )}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleImportSuggestCategories}
                    disabled={importSuggesting || categories.length === 0}
                    title="Usa IA gratuita (Transformers.js) no navegador. Na primeira vez o modelo é baixado (~25 MB)."
                    className="inline-flex items-center gap-2"
                  >
                    <IconSparkles />
                    {importSuggesting
                      ? `Sugerindo... ${importSuggestProgress.current}/${importSuggestProgress.total}`
                      : 'Sugerir categorias com IA'}
                  </Button>
                </div>
              </div>
              <div className="min-h-[320px] max-h-[65vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
                <table className="w-full min-w-0 table-fixed text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100">
                    <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      <th className="w-28 px-3 py-2">Data</th>
                      <th className="px-3 py-2">Descrição</th>
                      <th className="w-32 px-3 py-2">Tipo</th>
                      <th className="w-40 px-3 py-2">Categoria</th>
                      <th className="w-28 shrink-0 px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importParsed.transactions.map((row, idx) => {
                      const rowType = row.type ?? ((row.amount || 0) >= 0 ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense);
                      const isIncome = rowType === TRANSACTION_TYPES.income || rowType === TRANSACTION_TYPES.yield;
                      const catOptions = (isIncome ? incomeCategories : expenseCategories).map((c) => ({ value: c.id, label: c.name }));
                      const currentCategoryId = row.categoryId ?? row.suggestedCategoryId ?? '';
                      const dateStr = row.date ? format(row.date instanceof Date ? row.date : new Date(row.date), 'yyyy-MM-dd') : '';
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-1.5">
                            <Input
                              type="date"
                              value={dateStr}
                              onChange={(e) => setImportRowDate(idx, e.target.value)}
                              className="w-full min-w-0 text-sm"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              value={row.description ?? ''}
                              onChange={(e) => setImportRowDescription(idx, e.target.value)}
                              placeholder="Descrição"
                              className="w-full min-w-0 text-sm"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Select
                              value={rowType}
                              onChange={(v) => setImportRowType(idx, v)}
                              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                              className="w-full min-w-0 text-xs"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <Select
                              value={currentCategoryId}
                              onChange={(v) => setImportRowCategory(idx, v)}
                              options={[{ value: '', label: '—' }, ...catOptions]}
                              className="w-full min-w-0 text-xs"
                            />
                          </td>
                          <td className="shrink-0 px-3 py-1.5">
                            <CurrencyInput
                              value={numberToCurrencyInput(row.amount ?? 0)}
                              onChange={(v) => setImportRowAmount(idx, v)}
                              placeholder="0,00"
                              className="text-sm text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                {importParsed.transactions.length} transação(ões) encontrada(s). Categorias sugeridas pela IA podem ser alteradas antes de importar.
              </p>
            </>
          )}
          {importError && <p className="text-sm text-red-600">{importError}</p>}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setImportModalOpen(false)} disabled={importing}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleImportSubmit}
              disabled={!importParsed?.transactions?.length || !importAccountId || importing}
              className="inline-flex items-center gap-2"
            >
              <IconImport />
              {importing ? 'Importando...' : `Importar ${importParsed?.transactions?.length ?? 0} transação(ões)`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
