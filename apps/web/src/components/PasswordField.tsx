'use client';

import { useT } from '@/i18n/I18nProvider';
import { passwordStrength } from '@/lib/format';

const BAR: Record<string, { width: string; colour: string }> = {
  weak: { width: 'w-1/3', colour: 'bg-red-500' },
  fair: { width: 'w-2/3', colour: 'bg-amber-500' },
  strong: { width: 'w-full', colour: 'bg-emerald-600' },
};

/**
 * A password box with a strength meter under it.
 *
 * The meter guides, it does not decide: the server applies the real rule, and
 * this is only here so somebody is not told "too weak" after submitting a form.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'new-password',
  hint,
  showMeter = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  hint?: string;
  showMeter?: boolean;
}) {
  const t = useT();
  const strength = passwordStrength(value);
  const bar = BAR[strength];

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        type="password"
        required
        autoComplete={autoComplete}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {showMeter && value.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1.5 flex-1 rounded-full bg-stone-200">
            <span className={`block h-1.5 rounded-full transition-all ${bar.width} ${bar.colour}`} />
          </span>
          <span className="text-xs text-stone-600" aria-live="polite">
            {t('password.strength')}: {t(`password.strength.${strength}` as 'password.strength.weak')}
          </span>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}
