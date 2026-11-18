'use client';

import { useEffect, useState } from 'react';
import PasswordField from '@/components/PasswordField';
import RequireRole from '@/components/RequireRole';
import { useI18n } from '@/i18n/I18nProvider';
import { LANGUAGES, LANGUAGE_NAMES } from '@/i18n/dictionaries';
import { formatDateTime, formatKzt, roleKey, translateError } from '@/lib/format';
import type { Language } from '@/lib/types';
import { useChangePasswordMutation, useProfileQuery, useUpdateProfileMutation } from '@/store/api';

export default function ProfilePage() {
  return (
    <RequireRole roles={['CUSTOMER', 'KITCHEN', 'ACCOUNTANT', 'ADMIN']}>
      <Profile />
    </RequireRole>
  );
}

function Profile() {
  const { t, lang, setLang } = useI18n();
  const { data, isLoading, error } = useProfileQuery();

  if (isLoading) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (error != null) return <p role="alert" className="text-red-700">{translateError(error, t)}</p>;
  if (!data) return null;

  const p = data.profile;
  const isCustomer = p.role === 'CUSTOMER';

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
      <p className="mt-1 text-sm text-stone-600">{t('profile.subtitle')}</p>

      {isCustomer && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="card">
            <dt className="text-sm text-stone-600">{t('profile.orderCount')}</dt>
            <dd className="text-2xl font-semibold">{p.orderCount}</dd>
          </div>
          <div className="card">
            <dt className="text-sm text-stone-600">{t('profile.deliveredCount')}</dt>
            <dd className="text-2xl font-semibold">{p.deliveredCount}</dd>
          </div>
          <div className="card">
            <dt className="text-sm text-stone-600">{t('profile.spent')}</dt>
            <dd className="text-xl font-semibold">{formatKzt(p.spentTiyn, lang)}</dd>
          </div>
          <div className="card">
            <dt className="text-sm text-stone-600">{t('profile.bonus')}</dt>
            <dd className="text-2xl font-semibold text-amber-700">{p.bonusPoints ?? 0}</dd>
          </div>
        </dl>
      )}

      <DetailsForm
        profile={p}
        isCustomer={isCustomer}
        onLanguageApplied={(next) => setLang(next)}
      />
      <ChangePassword changedAt={p.passwordChangedAt} />
    </div>
  );
}

function DetailsForm({
  profile,
  isCustomer,
  onLanguageApplied,
}: {
  profile: { fullName: string; phone: string | null; address: string | null; language: Language; email: string; role: string };
  isCustomer: boolean;
  onLanguageApplied: (lang: Language) => void;
}) {
  const { t } = useI18n();
  const [update, { isLoading }] = useUpdateProfileMutation();
  const [form, setForm] = useState({
    fullName: profile.fullName,
    // Staff have no delivery details; the server ignores these for them, and
    // placeholders keep the form valid rather than blocking a language change.
    phone: profile.phone ?? '+7 700 000 00 00',
    address: profile.address ?? 'Not applicable',
    language: profile.language,
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // If the profile arrives after the first render, take its values.
  useEffect(() => {
    setForm({
      fullName: profile.fullName,
      phone: profile.phone ?? '+7 700 000 00 00',
      address: profile.address ?? 'Not applicable',
      language: profile.language,
    });
  }, [profile.fullName, profile.phone, profile.address, profile.language]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await update(form).unwrap();
      onLanguageApplied(form.language);
      setMessage(t('profile.saved'));
    } catch (err) {
      setError(translateError(err, t));
    }
  }

  return (
    <form onSubmit={submit} className="card mt-5 space-y-4">
      <h2 className="font-medium">{t('profile.details')}</h2>

      <div>
        <label className="label">{t('profile.email')}</label>
        <input className="input bg-stone-100 text-stone-500" value={profile.email} readOnly disabled />
        <p className="mt-1 text-xs text-stone-500">{t('profile.emailFixed')}</p>
      </div>

      <div>
        <label className="label">{t('profile.role')}</label>
        <input className="input bg-stone-100 text-stone-500" value={t(roleKey(profile.role))} readOnly disabled />
      </div>

      <div>
        <label htmlFor="fullName" className="label">{t('register.fullName')}</label>
        <input
          id="fullName"
          className="input"
          required
          maxLength={80}
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
      </div>

      {isCustomer && (
        <>
          <div>
            <label htmlFor="phone" className="label">{t('register.phone')}</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              className="input"
              required
              maxLength={30}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <p className="mt-1 text-xs text-stone-500">{t('register.phoneHint')}</p>
          </div>
          <div>
            <label htmlFor="address" className="label">{t('register.address')}</label>
            <input
              id="address"
              className="input"
              required
              maxLength={240}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="language" className="label">{t('register.language')}</label>
        <select
          id="language"
          className="input"
          value={form.language}
          onChange={(e) => setForm({ ...form, language: e.target.value as Language })}
        >
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </div>

      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary" disabled={isLoading}>
        {isLoading ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}

function ChangePassword({ changedAt }: { changedAt: string }) {
  const { t, lang } = useI18n();
  const [change, { isLoading }] = useChangePasswordMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (next !== repeat) return setError(t('password.mismatch'));
    try {
      const result = await change({ currentPassword: current, newPassword: next }).unwrap();
      setMessage(result.message);
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (err) {
      setError(translateError(err, t));
    }
  }

  return (
    <form onSubmit={submit} className="card mt-5 space-y-4">
      <div>
        <h2 className="font-medium">{t('password.changeTitle')}</h2>
        <p className="mt-1 text-xs text-stone-500">
          {t('profile.passwordChangedAt')}: {formatDateTime(changedAt, lang)}
        </p>
      </div>

      <PasswordField
        id="current"
        label={t('password.current')}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        showMeter={false}
      />
      <PasswordField
        id="next"
        label={t('password.newPassword')}
        value={next}
        onChange={setNext}
        hint={t('register.passwordHint')}
      />
      <PasswordField
        id="repeat"
        label={t('password.repeatPassword')}
        value={repeat}
        onChange={setRepeat}
        showMeter={false}
      />

      <p className="text-xs text-stone-500">{t('profile.otherDevices')}</p>
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary" disabled={isLoading}>
        {isLoading ? t('common.saving') : t('password.change')}
      </button>
    </form>
  );
}
