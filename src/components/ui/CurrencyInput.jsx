import { useState } from 'react';
import { formatCurrencyInput } from '../../utils/currency.js';

/**
 * Campo de texto que aceita valor no formato brasileiro (ex.: 20.304,03).
 * value e onChange trabalham com string; use parseCurrency(value) ao salvar.
 */
export function CurrencyInput({ value, onChange, placeholder = '0,00', onBlur, className = '', ...props }) {
  const [focused, setFocused] = useState(false);

  const handleFocus = () => setFocused(true);
  const handleBlur = (e) => {
    setFocused(false);
    if (value !== '' && value != null) {
      const formatted = formatCurrencyInput(value);
      if (formatted !== '' && formatted !== value) {
        onChange(formatted);
      }
    }
    onBlur?.(e);
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    const allowed = raw.replace(/[^\d,]/g, '').replace(/,/g, (_, i, s) => (s.indexOf(',') === i ? ',' : ''));
    const hasComma = allowed.includes(',');
    const parts = allowed.split(',');
    let out = parts[0] || '';
    if (parts.length > 1) {
      out += ',' + parts.slice(1).join('').slice(0, 2);
    }
    onChange(out);
  };

  const displayValue = focused ? value : (value && formatCurrencyInput(value)) || value;

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={displayValue ?? ''}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${className}`}
      {...props}
    />
  );
}
