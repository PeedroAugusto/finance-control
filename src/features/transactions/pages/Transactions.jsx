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
  const [createStep, setCreateStep] = useState(1);
  const createIntentRef = useRef(false);
  const [expandedInstallmentGroups, setExpandedInstallmentGroups] = useState(() => new Set());

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-800">Transações</h2>
        <Button onClick={handleOpenModal} disabled={accounts.length === 0}>
          Nova transação
        </Button>
      </div>

      <p className="mb-4 text-slate-600">
        Registre entradas, saídas, transferências, investimentos e rendimentos. Vincule despesas ao cartão quando quiser.
      </p>

      {accounts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Período:</span>
            <Select
              value={periodFilter}
              onChange={setPeriodFilter}
              options={PERIOD_OPTIONS}
              className="min-w-[140px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Categoria:</span>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              className="min-w-[160px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Tipo:</span>
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOptions}
              className="min-w-[140px]"
            />
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Carregando...</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-amber-50/50 p-8 text-center text-slate-600">
          Crie pelo menos uma <strong>conta</strong> na aba Contas para poder registrar transações.
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-slate-500">
          Nenhuma transação. Clique em <strong>Nova transação</strong> para registrar.
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-slate-500">
          Nenhuma transação corresponde aos filtros. Tente outro período, categoria ou tipo.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 md:px-6">
            <p className="text-sm font-medium text-slate-600">
              {filteredTransactions.length} {filteredTransactions.length === 1 ? 'transação' : 'transações'}
              {(categoryFilter || typeFilter || periodFilter !== 'all') && ' (filtradas)'}
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
                {displayItems.map((item) => {
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
    </div>
  );
}
