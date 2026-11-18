'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import { translateError } from '@/lib/format';
import { useForgotPasswordMutation } from '@/store/api';

export default function ForgotPasswordPage() {
  const t = useT();
  const [forgot, { isLoading }] = useForgotPasswordMutation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ message: string; demoToken?: string; demoNote?: string } | null>(null);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      setSent(await forgot({ email }).unwrap());
    } catch (err) {
      setError(translateError(err, t));
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">{t('password.forgotTitle')}</h1>

      {sent ? (
        <div className="card mt-4 border-emerald-300 bg-emerald-50" role="status">
          {/* The same answer whether or not the address has an account, so the
              form cannot be used to find out who is registered here. */}
          <p>{sent.message}</p>

          {sent.demoToken && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium">{t('password.demoLinkTitle')}</p>
              <p className="mt-1 text-stone-700">{t('password.demoLinkText')}</p>
              <Link href={`/reset-password?token=${encodeURIComponent(sent.demoToken)}`} className="btn-primary mt-3">
                {t('password.openLink')}
              </Link>
            </div>
          )}

          <Link href="/login" className="btn-secondary mt-4">{t('password.backToSignIn')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-4 space-y-4">
          <p className="text-sm text-stone-600">{t('password.forgotIntro')}</p>
          <div>
            <label htmlFor="email" className="label">{t('login.email')}</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={isLoading}>
            {isLoading ? t('password.sending') : t('password.sendLink')}
          </button>
          <Link href="/login" className="block text-sm text-stone-600 underline">{t('password.backToSignIn')}</Link>
        </form>
      )}
    </div>
  );
}
