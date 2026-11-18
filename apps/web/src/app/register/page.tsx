'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PasswordField from '@/components/PasswordField';
import { useI18n } from '@/i18n/I18nProvider';
import { LANGUAGES, LANGUAGE_NAMES } from '@/i18n/dictionaries';
import { translateError } from '@/lib/format';
import type { Language } from '@/lib/types';
import { useRegisterMutation } from '@/store/api';

export default function RegisterPage() {
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const [register, { isLoading }] = useRegisterMutation();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', address: '', password: '' });
  const [language, setLanguage] = useState<Language>(lang);
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await register({ ...form, language }).unwrap();
      // The site switches to the language the new account chose straight away,
      // rather than waiting for the next sign-in.
      setLang(language);
      router.push('/');
    } catch (err) {
      setError(translateError(err, t));
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">{t('register.title')}</h1>
      <form onSubmit={submit} className="card mt-4 space-y-4">
        <div>
          <label htmlFor="fullName" className="label">{t('register.fullName')}</label>
          <input id="fullName" type="text" required autoComplete="name" className="input" value={form.fullName} onChange={set('fullName')} />
        </div>
        <div>
          <label htmlFor="email" className="label">{t('register.email')}</label>
          <input id="email" type="email" required autoComplete="email" inputMode="email" className="input" value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label htmlFor="phone" className="label">{t('register.phone')}</label>
          <input id="phone" type="tel" required autoComplete="tel" inputMode="tel" className="input" value={form.phone} onChange={set('phone')} />
          <p className="mt-1 text-xs text-stone-500">{t('register.phoneHint')}</p>
        </div>
        <div>
          <label htmlFor="address" className="label">{t('register.address')}</label>
          <input id="address" type="text" required autoComplete="street-address" className="input" value={form.address} onChange={set('address')} />
        </div>

        {/* The field added this week: the language the account reads the site in. */}
        <div>
          <label htmlFor="language" className="label">{t('register.language')}</label>
          <select
            id="language"
            className="input"
            value={language}
            onChange={(e) => {
              const next = e.target.value as Language;
              setLanguage(next);
              setLang(next); // show the form itself in the chosen language at once
            }}
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-stone-500">{t('register.languageHint')}</p>
        </div>

        <PasswordField
          id="password"
          label={t('register.password')}
          value={form.password}
          onChange={(value) => setForm({ ...form, password: value })}
          hint={t('register.passwordHint')}
        />

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={isLoading}>
          {isLoading ? t('register.submitting') : t('register.submit')}
        </button>
        <p className="text-sm text-stone-600">
          {t('register.haveAccount')} <Link href="/login" className="underline">{t('nav.signIn')}</Link>
        </p>
      </form>
    </div>
  );
}
