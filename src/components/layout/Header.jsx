import { useWorkspaceStore } from '../../store/workspaceStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { MobileNav } from './MobileNav.jsx';
import { formatCurrency } from '../../utils/currency.js';
import { useState, useEffect } from 'react';
import { getAccounts } from '../../api/firestore/accounts.js';
import { applyPendingTransactions } from '../../api/firestore/transactions.js';

export function Header() {
  const { user } = useAuthStore();
  const { current } = useWorkspaceStore();
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!current?.id) return;
    applyPendingTransactions(current.id).then(() =>
      getAccounts(current.id)
    ).then((accounts) => {
      const total = accounts.reduce(
        (s, a) => s + (Number(a.currentBalance) ?? Number(a.initialBalance) ?? 0),
        0
      );
      setBalance(total);
    });
  }, [current?.id]);

  return (
    <header className="flex items-center justify-between border-b border-slate-200/60 bg-white/90 px-4 py-4 shadow-sm backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-4">
        <MobileNav />
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Olá{current?.name ? `, ${current.name}` : ''}!
          </h2>
          <p className="text-sm text-slate-500">
            {balance != null ? (
              <>Saldo: <span className="font-semibold tabular-nums text-slate-700">{formatCurrency(balance)}</span></>
            ) : (
              'Carregando...'
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {user?.email && (
          <span className="hidden max-w-[200px] truncate text-sm text-slate-500 sm:inline">{user.email}</span>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-600 text-sm font-semibold text-white shadow-md shadow-sky-500/20">
          {user?.email?.[0]?.toUpperCase() ?? '?'}
        </div>
      </div>
    </header>
  );
}
