/**
 * Toggle (switch) para sim/não.
 * @param {boolean} checked
 * @param {(checked: boolean) => void} onChange
 * @param {string} [label]
 * @param {string} [className]
 */
export function Toggle({ checked, onChange, label, className = '', ...props }) {
  return (
    <label className={`group inline-flex cursor-pointer items-center gap-3 ${className}`} {...props}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors group-has-[:checked]:bg-sky-500">
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform group-has-[:checked]:translate-x-5" aria-hidden />
      </span>
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
    </label>
  );
}
