export function Modal({ open, onClose, title, children, contentClassName = '' }) {
  if (!open) return null;
  const isLarge = !!contentClassName;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-lg rounded-2xl border border-slate-200/60 bg-white shadow-xl ${contentClassName}${contentClassName ? ' flex max-h-[90vh] flex-col' : ''}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={`p-6 ${isLarge ? 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
