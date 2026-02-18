export function Button({
  children,
  type = 'button',
  disabled = false,
  variant = 'primary',
  className = '',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variants = {
    primary:
      'bg-sky-600 text-white shadow-sm hover:bg-sky-700 focus:ring-sky-500 active:bg-sky-800',
    secondary:
      'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 hover:border-slate-300 focus:ring-slate-400',
    danger:
      'bg-red-600 text-white shadow-sm hover:bg-red-700 focus:ring-red-500 active:bg-red-800',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
