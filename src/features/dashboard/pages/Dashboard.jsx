import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { useAuthStore } from '../../../store/authStore.js';
import { getAccounts } from '../../../api/firestore/accounts.js';
import { getTransactions, getTransactionsUpToEnd, applyPendingTransactions, ensureRecurringInstances } from '../../../api/firestore/transactions.js';
import { getCategories } from '../../../api/firestore/categories.js';
import { getCreditCards } from '../../../api/firestore/creditCards.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { formatCurrency } from '../../../utils/currency.js';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';

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

/** Categorias consideradas despesas fixas para o indicador de saúde. */
const FIXED_CATEGORY_NAMES = new Set(['Moradia', 'Planos', 'Transporte', 'Educação', 'Saúde']);

/**
 * Calcula score de saúde financeira com base em % gasto/renda, cartão, investido e despesas fixas.
 * Status: critical (0-40), attention (41-70), healthy (71-90), excellent (91-100)
 * @returns {{ status: string, score: number, metrics: Object }}
 */
function computeHealthScore(income, expense, cardTotal, investmentTotal, fixedExpenseTotal) {
  if (!income || income <= 0) {
    return { status: 'attention', score: 50, metrics: { pctExpense: 0, pctCard: 0, pctInvested: 0, pctFixed: 0 } };
  }
  const pctExpense = (expense / income) * 100;
  const pctCard = (cardTotal / income) * 100;
  const pctInvested = (investmentTotal / income) * 100;
  const pctFixed = (fixedExpenseTotal / income) * 100;

  const scoreExpense = pctExpense <= 55 ? 100 : pctExpense <= 75 ? 50 : pctExpense <= 90 ? 20 : 0;
  const scoreCard = pctCard <= 25 ? 100 : pctCard <= 40 ? 50 : pctCard <= 55 ? 25 : 0;
  const scoreInvested = pctInvested >= 15 ? 100 : pctInvested >= 10 ? 80 : pctInvested >= 5 ? 50 : pctInvested > 0 ? 30 : 10;
  const scoreFixed = pctFixed <= 50 ? 100 : pctFixed <= 65 ? 50 : pctFixed <= 80 ? 25 : 0;

  const weights = { expense: 0.3, card: 0.25, invested: 0.25, fixed: 0.2 };
  const score = Math.round(
    scoreExpense * weights.expense +
      scoreCard * weights.card +
      scoreInvested * weights.invested +
      scoreFixed * weights.fixed
  );

  let status = 'healthy';
  if (score <= 40) status = 'critical';
  else if (score <= 70) status = 'attention';
  else if (score <= 90) status = 'healthy';
  else status = 'excellent';

  return {
    status,
    score: Math.min(100, Math.max(0, score)),
    metrics: {
      pctExpense: Math.round(pctExpense * 10) / 10,
      pctCard: Math.round(pctCard * 10) / 10,
      pctInvested: Math.round(pctInvested * 10) / 10,
      pctFixed: Math.round(pctFixed * 10) / 10,
    },
  };
}

/**
 * Gera texto explicativo e recomendação com base no score e métricas.
 */
function getHealthInsight(health) {
  const { status, score, metrics } = health;
  const { pctExpense, pctCard, pctInvested, pctFixed } = metrics;
  const insights = [];
  const recommendations = [];

  if (pctExpense <= 50) {
    insights.push(`Você está gastando apenas ${pctExpense}% da sua renda.`);
  } else if (pctExpense <= 65) {
    insights.push(`Gastos em ${pctExpense}% da renda.`);
  } else if (pctExpense > 70) {
    insights.push(`Gastos em ${pctExpense}% da renda — acima do ideal.`);
    recommendations.push('Reduza gastos ou busque fontes extras de renda.');
  }

  if (pctInvested >= 15) {
    insights.push(`Investindo ${pctInvested}% da renda.`);
  } else if (pctInvested >= 5 && pctInvested < 15) {
    insights.push(`Investimentos em ${pctInvested}% — pode melhorar.`);
    if (status === 'attention' || status === 'critical') recommendations.push('Tente reservar ao menos 10% da renda para investimentos.');
  } else if (pctInvested < 5 && pctInvested > 0) {
    insights.push(`Investimentos baixos (${pctInvested}%).`);
    recommendations.push('Comece reservando 5–10% da renda mensalmente.');
  } else {
    recommendations.push('Comece a investir parte da renda para o futuro.');
  }

  if (pctCard > 35) {
    insights.push(`Cartão em ${pctCard}% da renda.`);
    recommendations.push('Evite depender do cartão; prefira débito quando possível.');
  } else if (pctCard <= 25 && pctCard > 0) {
    insights.push(`Uso moderado do cartão (${pctCard}%).`);
  }

  if (pctFixed > 65) {
    insights.push(`Despesas fixas em ${pctFixed}% da renda.`);
    recommendations.push('Revise assinaturas e custos fixos para aumentar margem.');
  }

  const explanation = insights.length > 0 ? insights.join(' ') : 'Analise suas métricas para entender o score.';
  const recommendation = recommendations.length > 0 ? recommendations[0] : (score >= 71 ? 'Continue mantendo o controle das finanças.' : 'Faça pequenos ajustes para melhorar.');

  return { explanation, recommendation };
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
  const { user } = useAuthStore();
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
  const [balanceEvolution, setBalanceEvolution] = useState([]);
  const [healthScore, setHealthScore] = useState(null);
  const [healthCardCollapsed, setHealthCardCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('finance-health-card-collapsed');
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });
  const [expandedChart, setExpandedChart] = useState(null);

  useEffect(() => {
    if (!current?.id) return;
    setLoading(true);
    const { start, end, limitCount } = getDateRange(period);
    const isCurrentPeriod = period === 'this_month';

    (user?.uid ? ensureRecurringInstances(current.id, user.uid) : Promise.resolve())
      .then(() => applyPendingTransactions(current.id))
      .then(() =>
        Promise.all([
          getAccounts(current.id),
          getTransactions(current.id, { start, end, limitCount }),
          isCurrentPeriod ? Promise.resolve([]) : getTransactionsUpToEnd(current.id, end),
          getTransactions(current.id, { limitCount: 50 }),
          getCategories(current.id),
          getCreditCards(current.id),
        ])
      )
      .then(([accounts, txsPeriod, txsUpToEnd, txsRecent, cats, cards]) => {
        setCategories(cats);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const endOfTodayTs = endOfToday.getTime();
        const toDate = (t) => t.date?.getTime?.() ?? new Date(t.date).getTime();
        const txsUpToToday = txsPeriod.filter((t) => toDate(t) <= endOfTodayTs);

        const total = isCurrentPeriod
          ? accounts.reduce((s, a) => s + toNumberReais(a.currentBalance ?? a.initialBalance), 0)
          : (txsUpToEnd?.length > 0
              ? computeBalanceAtEnd(accounts, txsUpToEnd)
              : accounts.reduce((s, a) => s + toNumberReais(a.currentBalance ?? a.initialBalance), 0));
        setTotalBalance(total);

        const expenseFiltered = categoryFilter
          ? txsUpToToday.filter((t) => (t.type === 'expense' || t.type === 'investment') && t.categoryId === categoryFilter)
          : txsUpToToday;

        let income = 0;
        txsUpToToday.forEach((t) => {
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
        const recentUpToToday = txsRecent.filter((t) => toDate(t) <= endOfTodayTs);
        const recentSorted = [...recentUpToToday].sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0));
        const byGroup = {};
        recentSorted.forEach((t) => {
          const key = t.creditCardPurchaseId || t.id;
          if (!byGroup[key]) byGroup[key] = [];
          byGroup[key].push(t);
        });
        const onePerGroup = Object.values(byGroup).map((group) => {
          if (group.length === 1) return group[0];
          const byDate = [...group].sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0));
          const rep = byDate[0];
          const baseDesc = (rep.description || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim() || 'Parcelado';
          return { ...rep, description: `${baseDesc} (${group.length} parcelas)` };
        });
        const byDateDesc = onePerGroup.sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0));
        setRecentTx(byDateDesc.slice(0, 5));

        const balanceStart = total - income + expense;
        const sorted = [...txsUpToToday].sort((a, b) => (a.date?.getTime?.() ?? 0) - (b.date?.getTime?.() ?? 0));
        const evolution = [{ date: format(start, 'dd/MM'), balance: balanceStart }];
        let running = balanceStart;
        sorted.forEach((t) => {
          const amt = toNumberReais(t.amount);
          if (t.type === 'income' || t.type === 'yield') running += amt;
          else if (t.type === 'expense' || t.type === 'investment') running -= amt;
          const d = t.date instanceof Date ? t.date : new Date(t.date);
          evolution.push({ date: format(d, 'dd/MM'), balance: running });
        });
        if (evolution.length === 1) evolution.push({ date: format(end, 'dd/MM'), balance: total });
        setBalanceEvolution(evolution);

        let investmentTotal = 0;
        let fixedExpenseTotal = 0;
        let healthExpense = 0;
        let healthCardTotal = 0;
        txsUpToToday.forEach((t) => {
          const amt = toNumberReais(t.amount);
          const catName = cats.find((c) => c.id === t.categoryId)?.name || 'Outros';
          if (t.type === 'investment') {
            investmentTotal += amt;
          } else if (t.type === 'expense') {
            healthExpense += amt;
            if (FIXED_CATEGORY_NAMES.has(catName)) fixedExpenseTotal += amt;
            if (t.creditCardId) healthCardTotal += amt;
          }
        });
        const health = computeHealthScore(income, healthExpense, healthCardTotal, investmentTotal, fixedExpenseTotal);
        setHealthScore(health);
      })
      .finally(() => setLoading(false));
  }, [current?.id, period, categoryFilter, user?.uid]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="skeleton h-9 w-48" />
            <div className="mt-2 h-4 w-56 skeleton" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-200/60 transition-opacity duration-300">
          <div className="skeleton h-4 w-16" />
          <div className="flex flex-wrap items-center gap-4">
            <div className="skeleton h-10 w-40 rounded-xl" />
            <div className="skeleton h-10 w-44 rounded-xl" />
          </div>
        </div>
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white p-6 shadow-sm">
              <div className="skeleton mb-2 h-3 w-24" />
              <div className="skeleton h-8 w-28" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="skeleton h-80 rounded-2xl lg:col-span-2" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
        <div className="skeleton h-64 rounded-2xl" />
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

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/80 p-4 shadow-[var(--shadow-card)] ring-1 ring-slate-200/60 backdrop-blur-sm transition-all duration-300 ease-out">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Filtros</span>
        <div className="flex flex-wrap items-center gap-4 transition-opacity duration-200">
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

      {healthScore && (() => {
        const STATUS_CONFIG = {
          critical: { label: 'Crítico', emoji: '🔴', circle: 'stroke-rose-500' },
          attention: { label: 'Atenção', emoji: '🟡', circle: 'stroke-amber-500' },
          healthy: { label: 'Saudável', emoji: '🟢', circle: 'stroke-emerald-500' },
          excellent: { label: 'Excelente', emoji: '🟣', circle: 'stroke-violet-500' },
        };
        const config = STATUS_CONFIG[healthScore.status] || STATUS_CONFIG.attention;
        const insight = getHealthInsight(healthScore);
        const circumference = 2 * Math.PI * 54;
        const strokeDashoffset = circumference - (healthScore.score / 100) * circumference;

        const handleToggle = () => {
          const next = !healthCardCollapsed;
          setHealthCardCollapsed(next);
          try {
            localStorage.setItem('finance-health-card-collapsed', JSON.stringify(next));
          } catch {}
        };

        if (healthCardCollapsed) {
          const c = 2 * Math.PI * 18;
          const off = c - (healthScore.score / 100) * c;
          return (
            <button
              type="button"
              onClick={handleToggle}
              className="card card-hover flex w-full items-center justify-between gap-4 p-4 text-left ring-1 ring-slate-200/50"
            >
              <div className="flex items-center gap-4">
                <div className="relative h-14 w-14 shrink-0">
                  <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-200" />
                    <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" strokeLinecap="round" className={config.circle} style={{ strokeDasharray: c, strokeDashoffset: off }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-semibold tabular-nums text-slate-800">{healthScore.score}</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{config.emoji}</span>
                    <span className="text-sm font-medium text-slate-700">{config.label}</span>
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-slate-500">
                    <span>Gasto {healthScore.metrics.pctExpense}%</span>
                    <span>Cartão {healthScore.metrics.pctCard}%</span>
                    <span>Investido {healthScore.metrics.pctInvested}%</span>
                    <span>Fixas {healthScore.metrics.pctFixed}%</span>
                  </div>
                </div>
              </div>
              <span className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-600" aria-hidden title="Expandir">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </span>
            </button>
          );
        }

        return (
          <div className="card card-hover overflow-hidden p-6 ring-1 ring-slate-200/50 sm:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-500">Saúde financeira</h2>
              <button
                type="button"
                onClick={handleToggle}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-600"
                title="Recolher"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              </button>
            </div>
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="relative flex h-32 w-32 shrink-0">
                <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-200" />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    className={`${config.circle} transition-[stroke-dashoffset] duration-700 ease-out`}
                    style={{ strokeDasharray: circumference, strokeDashoffset }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold tabular-nums text-slate-800">{healthScore.score}</span>
                  <span className="text-xs text-slate-500">/100</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{config.emoji}</span>
                  <span className="text-sm font-medium text-slate-700">{config.label}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{insight.explanation}</p>
                <p className="mt-1.5 text-xs text-slate-500">{insight.recommendation}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Gasto/renda {healthScore.metrics.pctExpense}%</span>
                  <span>Cartão {healthScore.metrics.pctCard}%</span>
                  <span>Investido {healthScore.metrics.pctInvested}%</span>
                  <span>Fixas {healthScore.metrics.pctFixed}%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
      {balanceEvolution.length > 0 && (
        <div className="card card-hover p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Evolução do saldo</h2>
              <p className="mt-0.5 text-sm text-slate-500">Saldo ao longo do período</p>
            </div>
            <button
              type="button"
              onClick={() => setExpandedChart('balance')}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-600"
              title="Expandir gráfico"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            </button>
          </div>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceEvolution} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="balanceArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Saldo']}
                  labelFormatter={(label) => label}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Area type="monotone" dataKey="balance" fill="url(#balanceArea)" stroke="none" />
                <Line type="monotone" dataKey="balance" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card card-hover p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Despesas por categoria</h2>
              <p className="mt-0.5 text-sm text-slate-500">{getPeriodLabel(period)}{categoryFilter ? ` · ${expenseCategories.find((c) => c.id === categoryFilter)?.name ?? 'Categoria'}` : ''}</p>
            </div>
            {categoryData.length > 0 && (
              <button
                type="button"
                onClick={() => setExpandedChart('categories')}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-600"
                title="Expandir gráfico"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              </button>
            )}
          </div>
          {categoryData.length === 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-slate-500">
              <p>Nenhuma despesa no período.</p>
              <Link to="/transacoes" className="mt-3 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline">
                Registrar transação
              </Link>
            </div>
          ) : (
            <div className="mt-6 h-72 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v)} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value, name, props) => {
                      const total = categoryData.reduce((s, d) => s + d.value, 0);
                      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                      return [formatCurrency(value) + ` (${pct}%)`, props.payload?.name];
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
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
          <div className="flex items-center gap-2">
            {cardExpensesTotal > 0 && (
              <button
                type="button"
                onClick={() => setExpandedChart('card')}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-600"
                title="Expandir gráfico"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              </button>
            )}
            <Link to="/cartoes" className="text-sm font-semibold text-sky-600 transition hover:text-sky-700 hover:underline">
              Cartões →
            </Link>
          </div>
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
                  <Tooltip
                    formatter={(value) => {
                      const total = cardExpensesByCategory.reduce((s, d) => s + d.value, 0);
                      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                      return formatCurrency(value) + ` (${pct}%)`;
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Resumo por cartão</p>
              {cardExpensesByCard.length > 0 && (
                <div className="h-48 min-h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cardExpensesByCard} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                      <XAxis type="number" tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v)} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul className="mt-3 space-y-2">
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

      {expandedChart && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setExpandedChart(null)}
        >
          <div
            className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {expandedChart === 'balance' && 'Evolução do saldo'}
                {expandedChart === 'categories' && 'Despesas por categoria'}
                {expandedChart === 'card' && 'Despesas no cartão'}
              </h3>
              <button
                type="button"
                onClick={() => setExpandedChart(null)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                title="Fechar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-6">
              {expandedChart === 'balance' && balanceEvolution.length > 0 && (
                <div className="h-full min-h-[300px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={balanceEvolution} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <defs>
                        <linearGradient id="balanceAreaExpanded" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <Tooltip formatter={(value) => [formatCurrency(value), 'Saldo']} labelFormatter={(label) => label} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      <Area type="monotone" dataKey="balance" fill="url(#balanceAreaExpanded)" stroke="none" />
                      <Line type="monotone" dataKey="balance" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 4 }} activeDot={{ r: 6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {expandedChart === 'categories' && categoryData.length > 0 && (
                <div className="h-full min-h-[300px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v)} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 13 }} stroke="#94a3b8" />
                      <Tooltip
                        formatter={(value, name, props) => {
                          const total = categoryData.reduce((s, d) => s + d.value, 0);
                          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                          return [formatCurrency(value) + ` (${pct}%)`, props.payload?.name];
                        }}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={36}>
                        {categoryData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {expandedChart === 'card' && cardExpensesByCategory.length > 0 && (
                <div className="flex h-full min-h-[300px] flex-1 items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={cardExpensesByCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius="35%"
                        outerRadius="55%"
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {cardExpensesByCategory.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => {
                          const total = cardExpensesByCategory.reduce((s, d) => s + d.value, 0);
                          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                          return formatCurrency(value) + ` (${pct}%)`;
                        }}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
