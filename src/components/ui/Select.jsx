export function Select({ value, onChange, options, placeholder, className = '', ...props }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${className}`}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
