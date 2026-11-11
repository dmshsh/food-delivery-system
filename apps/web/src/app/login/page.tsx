'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorCode, errorMessage } from '@/lib/format';
import { useLoginMutation } from '@/store/api';

const DEMO = [
  ['Customer', 'alice@example.test'],
  ['Kitchen', 'kitchen@example.test'],
  ['Accountant', 'accounts@example.test'],
  ['Administrator', 'admin@example.test'],
];

export default function LoginPage() {
  const router = useRouter();
  const [login, { isLoading }] = useLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // A blocked account is a different kind of problem from a typo, and it is shown differently.
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
      setBlocked(code === 'account_blocked' || code === 'account_disabled');
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form onSubmit={submit} className="card mt-4 space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <p
            role="alert"
            className={blocked ? 'rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800' : 'text-sm text-red-700'}
          >
            {error}
            {blocked && (
              <span className="mt-1 block text-xs">
                Five wrong passwords in fifteen minutes block an account for fifteen minutes. An administrator can lift
                the block sooner.
              </span>
            )}
          </p>
        )}
        <button className="btn-primary w-full" disabled={isLoading}>{isLoading ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-sm text-stone-600">No account? <Link href="/register" className="underline">Register</Link></p>
      </form>

      <div className="card mt-4 text-sm text-stone-700">
        <p className="mb-2 font-medium">Demo accounts (password <code>StudentDemo123!</code>)</p>
        <ul className="space-y-1">
          {DEMO.map(([role, mail]) => (
            <li key={mail}>
              <button type="button" className="underline" onClick={() => { setEmail(mail); setPassword('StudentDemo123!'); }}>
                {role}: {mail}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
