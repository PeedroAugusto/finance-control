import { useState } from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/contas', label: 'Contas' },
  { to: '/transacoes', label: 'Transações' },
  { to: '/cartoes', label: 'Cartões' },
  { to: '/configuracoes', label: 'Configurações' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
        aria-label="Abrir menu"
      >
        <span>☰</span> Menu
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" aria-hidden onClick={() => setOpen(false)} />
          <nav className="fixed left-0 top-0 z-50 h-full w-64 border-r border-slate-200 bg-slate-800 p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold text-white">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {links.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
