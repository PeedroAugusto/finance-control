import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

  useEffect(() => {
    if (!open) return;
    const onEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [open]);

  const menuContent = open && createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm"
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <nav
        className="fixed left-0 top-0 z-[101] flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-700 bg-slate-800 shadow-2xl"
        aria-label="Menu principal"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 p-4">
          <div className="flex min-h-[3rem] items-center gap-3 overflow-visible">
            <img
              src="/assets/Logo-Aberta.png"
              alt="Vellun"
              className="relative h-24 w-auto object-contain"
              style={{ left: '-24px' }}
            />
            <span className="text-lg font-semibold text-white">Menu</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white"
            aria-label="Fechar menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-auto p-4">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                  isActive ? 'bg-sky-500/25 text-sky-200' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>,
    document.body
  );

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
        aria-label="Abrir menu"
        aria-expanded={open}
      >
        <span>☰</span> Menu
      </button>
      {menuContent}
    </div>
  );
}
