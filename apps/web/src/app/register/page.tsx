'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorMessage } from '@/lib/format';
import { useRegisterMutation } from '@/store/api';

const FIELDS = [
  { name: 'fullName', label: 'Full name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { name: 'address', label: 'Delivery address', type: 'text', autoComplete: 'street-address' },
  { name: 'password', label: 'Password (8+ characters)', type: 'password', autoComplete: 'new-password' },
] as const;

type FormState = Record<(typeof FIELDS)[number]['name'], string>;

export default function RegisterPage() {
  const router = useRouter();
  const [register, { isLoading }] = useRegisterMutation();
  const [form, setForm] = useState<FormState>({ fullName: '', email: '', phone: '', address: '', password: '' });
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await register(form).unwrap();
      router.push('/');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <form onSubmit={submit} className="card mt-4 space-y-4">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label htmlFor={f.name} className="label">{f.label}</label>
            <input
              id={f.name}
              type={f.type}
              required
              autoComplete={f.autoComplete}
              className="input"
              value={form[f.name]}
              onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
            />
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={isLoading}>{isLoading ? 'Creating…' : 'Register'}</button>
        <p className="text-sm text-stone-600">Already registered? <Link href="/login" className="underline">Sign in</Link></p>
      </form>
    </div>
  );
}
