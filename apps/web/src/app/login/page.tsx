'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import { errorCode, translateError } from '@/lib/format';
import { useLoginMutation } from '@/store/api';

const DEMO = [
  ['login.role.customer', 'alice@example.test'],
  ['login.role.kitchen', 'kitchen@example.test'],
  ['login.role.accountant', 'accounts@example.test'],
  ['login.role.admin', 'admin@example.test'],
] as const;

const DEMO_PASSWORD = 'StudentDemo123!';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [login, { isLoading }] = useLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // A blocked account, or a blocked network, is a different kind of problem from
  // a typo, and is shown differently.
  const [blocked, setBlocked] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBlocked(false);
    try {
      const { user } = await login({ email, password }).unwrap();
      router.push(
        user.role === 'KITCHEN'
          ? '/kitchen'
          : user.role === 'ACCOUNTANT'
            ? '/accounting'
            : user.role === 'ADMIN'
              ? '/admin'
              : '/',
      );
    } catch (err) {
      const code = errorCode(err);
      setBlocked(code === 'account_blocked' || code === 'account_disabled' || code === 'ip_blocked');
      setError(translateError(err, t));
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">{t('login.title')}</h1>
      <form onSubmit={submit} className="card mt-4 space-y-4">
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
        <div>
          <label htmlFor="password" className="label">{t('login.password')}</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p
            role="alert"
            className={blocked ? 'rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800' : 'text-sm text-red-700'}
          >
            {error}
            {blocked && <span className="mt-1 block text-xs">{t('login.blockedHint')}</span>}
          </p>
        )}
        <button className="btn-primary w-full" disabled={isLoading}>
          {isLoading ? t('login.submitting') : t('login.submit')}
        </button>
        <div className="flex flex-wrap justify-between gap-2 text-sm text-stone-600">
          <span>
            {t('login.noAccount')}{' '}
            <Link href="/register" className="underline">{t('nav.register')}</Link>
          </span>
          <Link href="/forgot-password" className="underline">{t('login.forgot')}</Link>
        </div>
      </form>

      <div className="card mt-4 text-sm text-stone-700">
        <p className="mb-2 font-medium">{t('login.demoAccounts', { password: DEMO_PASSWORD })}</p>
        <ul className="space-y-1">
          {DEMO.map(([roleKey, mail]) => (
            <li key={mail}>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setEmail(mail);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                {t(roleKey)}: {mail}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
