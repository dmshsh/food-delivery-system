'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import PasswordField from '@/components/PasswordField';
import { useT } from '@/i18n/I18nProvider';
import { translateError } from '@/lib/format';
import { useResetPasswordMutation } from '@/store/api';

/**
 * `useSearchParams` makes this page dynamic, and Next asks for a boundary so the
 * rest of the page can still be prerendered.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-stone-500">…</p>}>
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [reset, { isLoading }] = useResetPasswordMutation();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    // Checked here only to save a round trip; the server decides what is valid.
    if (password !== repeat) return setError(t('password.mismatch'));
    try {
      const result = await reset({ token, password }).unwrap();
      setDone(result.message);
    } catch (err) {
      setError(translateError(err, t));
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold">{t('password.resetTitle')}</h1>
        <div className="card mt-4" role="alert">
          <p>{t('password.noToken')}</p>
          <Link href="/forgot-password" className="btn-primary mt-3">{t('password.forgotTitle')}</Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold">{t('password.resetTitle')}</h1>
        <div className="card mt-4 border-emerald-300 bg-emerald-50" role="status">
          <p>{done}</p>
          <button className="btn-primary mt-3" onClick={() => router.push('/login')}>
            {t('nav.signIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">{t('password.resetTitle')}</h1>
      <form onSubmit={submit} className="card mt-4 space-y-4">
        <PasswordField
          id="password"
          label={t('password.newPassword')}
          value={password}
          onChange={setPassword}
          hint={t('register.passwordHint')}
        />
        <PasswordField
          id="repeat"
          label={t('password.repeatPassword')}
          value={repeat}
          onChange={setRepeat}
          showMeter={false}
        />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={isLoading}>
          {isLoading ? t('common.saving') : t('password.setPassword')}
        </button>
        <Link href="/login" className="block text-sm text-stone-600 underline">{t('password.backToSignIn')}</Link>
      </form>
    </div>
  );
}
