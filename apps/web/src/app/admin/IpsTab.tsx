'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateTime, translateError } from '@/lib/format';
import { useBlockIpMutation, useBlockedIpsQuery, useUnblockIpMutation } from '@/store/api';

/**
 * Blocked addresses.
 *
 * The account limiter and this one answer different attacks. Blocking an
 * account stops someone guessing one person's password; it does nothing against
 * a sweep that tries two passwords each against two hundred accounts from the
 * same machine. That is what this page is for, which is why it also lists the
 * addresses that are collecting failures but are not blocked yet.
 */
export default function IpsTab() {
  const { t, lang } = useI18n();
  const { data, isLoading, error } = useBlockedIpsQuery(undefined, { pollingInterval: 20000 });
  const [blockIp, blocking] = useBlockIpMutation();
  const [unblockIp] = useUnblockIpMutation();
  const [form, setForm] = useState({ ip: '', reason: '' });
  const [message, setMessage] = useState('');

  async function block(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await blockIp({ ip: form.ip.trim(), reason: form.reason.trim() }).unwrap();
      setForm({ ip: '', reason: '' });
    } catch (err) {
      setMessage(translateError(err, t));
    }
  }

  async function unblock(ip: string) {
    setMessage('');
    try {
      await unblockIp(ip).unwrap();
    } catch (err) {
      setMessage(translateError(err, t));
    }
  }

  if (isLoading) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (error != null) return <p role="alert" className="text-red-700">{translateError(error, t)}</p>;
  if (!data) return null;

  return (
    <div>
      <h2 className="text-lg font-medium">{t('admin.tab.ips')}</h2>
      <p className="text-sm text-stone-600">{t('admin.ipsHint')}</p>
      <p className="mt-1 text-xs text-stone-500">
        {t('admin.ipsRules', {
          max: data.rules.maxFailures,
          window: data.rules.windowMinutes,
          block: data.rules.blockMinutes,
        })}
      </p>

      {message && (
        <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
      )}

      <form onSubmit={block} className="card mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="ip" className="label">{t('admin.ipAddress')}</label>
          <input
            id="ip"
            className="input"
            required
            maxLength={60}
            placeholder="203.0.113.42"
            value={form.ip}
            onChange={(e) => setForm({ ...form, ip: e.target.value })}
          />
        </div>
        <div className="min-w-[12rem] flex-[2]">
          <label htmlFor="ip-reason" className="label">{t('admin.ipReason')}</label>
          <input
            id="ip-reason"
            className="input"
            required
            maxLength={200}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <button className="btn-danger" disabled={blocking.isLoading}>{t('admin.ipBlockButton')}</button>
      </form>

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="px-4 py-2">{t('admin.ipAddress')}</th>
              <th className="px-4 py-2">{t('admin.ipReason')}</th>
              <th className="px-4 py-2 text-right">{t('admin.ipFailures')}</th>
              <th className="px-4 py-2">{t('admin.ipUntil')}</th>
              <th className="px-4 py-2">{t('admin.accessColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {data.addresses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-500">{t('admin.ipNoneBlocked')}</td>
              </tr>
            )}
            {data.addresses.map((row) => (
              <tr key={row.ip} className={`border-t border-stone-100 ${row.active ? 'bg-red-50' : ''}`}>
                <td className="px-4 py-2 font-mono text-xs">{row.ip}</td>
                <td className="px-4 py-2">
                  {row.reason || '—'}
                  {row.blockedByEmail && <div className="text-xs text-stone-500">{row.blockedByEmail}</div>}
                </td>
                <td className="px-4 py-2 text-right">{row.failures24h}</td>
                <td className="px-4 py-2">
                  {row.manual ? (
                    <span className="rounded bg-red-200 px-2 py-0.5 text-xs text-red-900">{t('admin.ipManual')}</span>
                  ) : row.blockedUntil ? (
                    formatDateTime(row.blockedUntil, lang)
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2">
                  <button className="btn-secondary" onClick={() => unblock(row.ip)}>{t('admin.unblock')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-medium">{t('admin.ipWatching')}</h3>
      <p className="text-sm text-stone-600">{t('admin.ipWatchingHint')}</p>
      {data.suspicious.length === 0 ? (
        <div className="card mt-2 text-sm text-stone-500">{t('admin.ipNoneWatching')}</div>
      ) : (
        <ul className="mt-2 space-y-2">
          {data.suspicious.map((row) => (
            <li key={row.ip} className="card flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-xs">{row.ip}</span>
              <span className="text-amber-800">{t('admin.ipFailures')}: {row.failures}</span>
              <span className="text-stone-600">{t('admin.ipAccountsTried', { count: row.accounts })}</span>
              <span className="text-stone-500">
                {t('admin.ipLastSeen')}: {formatDateTime(row.lastAt, lang)}
              </span>
              <button
                className="btn-danger ml-auto"
                onClick={() => setForm({ ip: row.ip, reason: `${row.failures} failed sign-ins in the last day` })}
              >
                {t('admin.block')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
