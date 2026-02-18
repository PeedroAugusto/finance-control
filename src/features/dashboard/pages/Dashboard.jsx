import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { getAccounts } from '../../../api/firestore/accounts.js';
import { getTransactions, getTransactionsUpToEnd, applyPendingTransactions } from '../../../api/firestore/transactions.js';
import { getCategories } from '../../../api/firestore/categories.js';
import { getCreditCards } from '../../../api/firestore/creditCards.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { formatCurrency } from '../../../utils/currency.js';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const CHART_COLORS = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#06b6d4', '#22d3ee', '#67e8f9', '#6366f1', '#818cf8', '#a5b4fc', '#c4b5fd'];

const TYPE_LABELS = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
  investment: 'Investimento',
  yield: 'Rendimento',
};

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'last_3_months', label: 'Últimos 3 meses' },
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
    case 'last_3_months':
      return { start: subMonths(startOfMonth(now), 2), end: endOfMonth(now), limitCount: 400 };
    case 'this_year':
      return { start: startOfYear(now), end: endOfYear(now), limitCount: 800 };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now), limitCount: 150 };
  }
}

function getPeriodLabel(period) {
  return PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? 'Este mês';
}

/** Converte valor (número ou string "47,03" / "47.032,86" / "47032.86") para número em reais. */
function toNumberReais(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const s = String(value).trim();
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s;
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Calcula o saldo total ao fim do período com base no saldo inicial das contas
 * e nas transações até endDate (sempre na mesma unidade: reais).
 */
function computeBalanceAtEnd(accounts, transactionsUpToEnd) {
  const byAccount = {};
  accounts.forEach((a) => {
    byAccount[a.id] = toNumberReais(a.initialBalance);
  });
  const sorted = [...transactionsUpToEnd].sort(
    (a, b) => (a.date?.getTime?.() ?? 0) - (b.date?.getTime?.() ?? 0)
  );
  sorted.forEach((t) => {
    const amt = toNumberReais(t.amount);
    if (t.type === 'income' || t.type === 'yield') {
      byAccount[t.accountId] = (byAccount[t.accountId] ?? 0) + amt;
    } else if (t.type === 'expense' || t.type === 'investment') {
      byAccount[t.accountId] = (byAccount[t.accountId] ?? 0) - amt;
    } else if (t.type === 'transfer' && t.targetAccountId) {
      byAccount[t.accountId] = (byAccount[t.accountId] ?? 0) - amt;
      byAccount[t.targetAccountId] = (byAccount[t.targetAccountId] ?? 0) + amt;
    }
  });
  return Object.values(byAccount).reduce((s, v) => s + v, 0);
}

export function Dashboard() {
  const { current } = useWorkspaceStore();
  const [period, setPeriod] = useState('this_month');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);
  const [categoryData, setCategoryData] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [cardExpensesTotal, setCardExpensesTotal] = useState(0);
  const [cardExpensesByCategory, setCardExpensesByCategory] = useState([]);
  const [cardExpensesByCard, setCardExpensesByCard] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!current?.id) return;
    setLoading(true);
    const { start, end, limitCount } = getDateRange(period);
    const isCurrentPeriod = period === 'this_month';

    applyPendingTransactions(current.id)
      .then(() =>
        Promise.all([
          getAccounts(current.id),
          getTransactions(current.id, { start, end, limitCount }),
          isCurrentPeriod ? Promise.resolve([]) : getTransactionsUpToEnd(current.id, end),
          getTransactions(current.id, { limitCount: 10 }),
          getCategories(current.id),
          getCreditCards(current.id),
        ])
      )
      .then(([accounts, txsPeriod, txsUpToEnd, txsRecent, cats, cards]) => {
        setCategories(cats);
        const total = isCurrentPeriod
          ? accounts.reduce((s, a) => s + toNumberReais(a.currentBalance ?? a.initialBalance), 0)
          : (txsUpToEnd?.length > 0
              ? computeBalanceAtEnd(accounts, txsUpToEnd)
              : accounts.reduce((s, a) => s + toNumberReais(a.currentBalance ?? a.initialBalance), 0));
        setTotalBalance(total);

        const expenseFiltered = categoryFilter
          ? txsPeriod.filter((t) => (t.type === 'expense' || t.type === 'investment') && t.categoryId === categoryFilter)
          : txsPeriod;

        let income = 0;
        txsPeriod.forEach((t) => {
          const amt = toNumberReais(t.amount);
          if (t.type === 'income' || t.type === 'yield') income += amt;
        });

        let expense = 0;
        const byCategory = {};
        const cardOnlyByCategory = {};
        const cardOnlyByCard = {};
        expenseFiltered.forEach((t) => {
          const amt = toNumberReais(t.amount);
          if (t.type === 'expense' || t.type === 'investment') {
            expense += amt;
            const catId = t.categoryId || 'outros';
            const catName = cats.find((c) => c.id === catId)?.name || 'Outros';
            byCategory[catName] = (byCategory[catName] || 0) + amt;
            if (t.creditCardId) {
              cardOnlyByCategory[catName] = (cardOnlyByCategory[catName] || 0) + amt;
              const cardName = cards.find((c) => c.id === t.creditCardId)?.name || 'Cartão';
              cardOnlyByCard[cardName] = (cardOnlyByCard[cardName] || 0) + amt;
            }
          }
        });
        setMonthIncome(income);
        setMonthExpense(expense);
        setCategoryData(
          Object.entries(byCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
        );
        const cardTotal = Object.values(cardOnlyByCard).reduce((s, v) => s + v, 0);
        setCardExpensesTotal(cardTotal);
        setCardExpensesByCategory(
          Object.entries(cardOnlyByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
        );
        setCardExpensesByCard(
          Object.entries(cardOnlyByCard).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
        );
        setRecentTx(txsRecent.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, [current?.id, period, categoryFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="h-11 w-11 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500">Carregando dashboard...</p>
      </div>
    );
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const categoryOptions = [
    { value: '', label: 'Todas as categorias' },
    ...expenseCategories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">{format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <Link to="/transacoes">
          <Button className="shadow-sm">Nova transação</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/80 p-4 shadow-[var(--shadow-card)] ring-1 ring-slate-200/60 backdrop-blur-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Filtros</span>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Período</label>
            <Select
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS}
              className="min-w-[160px] rounded-xl border-slate-200 bg-white"
            />
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Categoria</label>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              className="min-w-[180px] rounded-xl border-slate-200 bg-white"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card card-hover overflow-hidden p-6 ring-1 ring-slate-200/50">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {period === 'this_month' ? 'Saldo total' : 'Saldo no fim do período'}
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900">{formatCurrency(toNumberReais(totalBalance))}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 p-3 shadow-lg shadow-sky-500/20">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="card card-hover overflow-hidden p-6 ring-1 ring-slate-200/50">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Receitas {period === 'this_month' ? 'do mês' : 'no período'}</p>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-emerald-600">{formatCurrency(monthIncome)}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 shadow-lg shadow-emerald-500/20">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>
        <div className="card card-hover overflow-hidden p-6 ring-1 ring-slate-200/50">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Despesas {period === 'this_month' ? 'do mês' : 'no período'}</p>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-rose-600">{formatCurrency(monthExpense)}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 p-3 shadow-lg shadow-rose-500/20">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            </div>
          </div>
        </div>
        <div className="card card-hover overflow-hidden p-6 ring-1 ring-slate-200/50">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gasto no cartão {period === 'this_month' ? '(mês)' : '(período)'}</p>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-amber-600">{formatCurrency(cardExpensesTotal)}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-3 shadow-lg shadow-amber-500/20">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card card-hover p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Despesas por categoria</h2>
              <p className="mt-0.5 text-sm text-slate-500">{getPeriodLabel(period)}{categoryFilter ? ` · ${expenseCategories.find((c) => c.id === categoryFilter)?.name ?? 'Categoria'}` : ''}</p>
            </div>
          </div>
          {categoryData.length === 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-slate-500">
              <p>Nenhuma despesa no período.</p>
              <Link to="/transacoes" className="mt-3 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline">
                Registrar transação
              </Link>
            </div>
          ) : (
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card card-hover p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Transações recentes</h2>
              <p className="mt-0.5 text-sm text-slate-500">Últimas movimentações</p>
            </div>
            <Link to="/transacoes" className="text-sm font-semibold text-sky-600 transition hover:text-sky-700 hover:underline">
              Ver todas →
            </Link>
          </div>
          {recentTx.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-500">
              Nenhuma transação. <Link to="/transacoes" className="text-sky-600 hover:underline">Registrar</Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {recentTx.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl bg-slate-50/80 px-4 py-3 transition hover:bg-slate-100/80"
                >
                  <div>
                    <p className="font-medium text-slate-800">{tx.description || TYPE_LABELS[tx.type] || tx.type}</p>
                    <p className="text-xs text-slate-500">
                      {tx.date && format(tx.date instanceof Date ? tx.date : new Date(tx.date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <span
                    className={`font-semibold tabular-nums ${
                      tx.type === 'income' || tx.type === 'yield' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {tx.type === 'income' || tx.type === 'yield' ? '+' : '−'}
                    {formatCurrency(tx.amount ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card card-hover p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Despesas no cartão</h2>
            <p className="mt-0.5 text-sm text-slate-500">Gastos no período (por categoria)</p>
          </div>
          <Link to="/cartoes" className="text-sm font-semibold text-sky-600 transition hover:text-sky-700 hover:underline">
            Cartões →
          </Link>
        </div>
        {cardExpensesTotal === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-slate-500">
            <p>Nenhuma despesa no cartão no período.</p>
            <p className="mt-1 text-xs">Vincule o cartão ao criar uma despesa em Transações.</p>
            <Link to="/transacoes" className="mt-3 text-sm font-medium text-sky-600 hover:underline">
              Nova transação
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="h-64 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cardExpensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {cardExpensesByCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Resumo por cartão</p>
              <ul className="space-y-2">
                {cardExpensesByCard.map(({ name, value }) => (
                  <li key={name} className="flex items-center justify-between rounded-xl bg-slate-50/80 px-4 py-3 transition hover:bg-slate-100/80">
                    <span className="font-medium text-slate-800">{name}</span>
                    <span className="font-semibold tabular-nums text-amber-600">{formatCurrency(value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
