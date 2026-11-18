'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { SEVERITY_STYLE, formatDateTime, humanEvent, translateError } from '@/lib/format';
import type { Severity } from '@/lib/types';
import { useSecurityJournalQuery } from '@/store/api';

const KINDS = [
  'LOGIN_OK',
  'LOGIN_FAILED',
  'ACCOUNT_BLOCKED',
  'BLOCKED_LOGIN_ATTEMPT',
  'ACCOUNT_UNBLOCKED',
  'LOGOUT',
  'REGISTERED',
  'ROLE_DENIED',
  'ADMIN_ACTION',
  'IP_BLOCKED',
  'IP_UNBLOCKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_USED',
  'PROFILE_UPDATED',
];

const SEVERITIES: Severity[] = ['INFO', 'WARNING', 'CRITICAL'];

export default function SecurityTab() {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const { data, isLoading, error } = useSecurityJournalQuery({ kind, severity }, { pollingInterval: 10000 });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{t('admin.tab.security')}</h2>
          <p className="text-sm text-stone-600">{t('admin.journalHint')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="kind" className="label">{t('admin.event')}</label>
            <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {KINDS.map((k) => <option key={k} value={k}>{humanEvent(k)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="severity" className="label">{t('admin.importance')}</label>
            <select id="severity" className="input" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
              <option value="">{t('common.all')}</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
            </select>
          </div>
        </div>
      </div>

      {data && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {SEVERITIES.map((s) => (
            <div key={s} className="card">
              <dt className="text-sm text-stone-600">{t('admin.last24', { severity: s.toLowerCase() })}</dt>
              <dd className="text-2xl font-semibold">{data.last24h[s] ?? 0}</dd>
            </div>
          ))}
        </dl>
      )}

      {isLoading && <p className="mt-4 text-stone-500">{t('common.loading')}</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="px-4 py-2">{t('bonus.when')}</th>
              <th className="px-4 py-2">{t('admin.event')}</th>
              <th className="px-4 py-2">{t('admin.who')}</th>
              <th className="px-4 py-2">{t('admin.fromWhere')}</th>
              <th className="px-4 py-2">{t('admin.details')}</th>
            </tr>
          </thead>
          <tbody>
            {data && data.events.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-stone-500">{t('admin.journalEmpty')}</td></tr>
            )}
            {(data?.events ?? []).map((e) => (
              <tr key={e.id} className="border-t border-stone-100 align-top">
                <td className="whitespace-nowrap px-4 py-2">{formatDateTime(e.createdAt, lang)}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[e.severity]}`}>
                    {humanEvent(e.kind)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {e.userName ?? '—'}
                  {e.email && <div className="text-xs text-stone-500">{e.email}</div>}
                </td>
                <td className="px-4 py-2 text-xs text-stone-500">{e.ip || '—'}</td>
                <td className="px-4 py-2 text-stone-700">{e.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
