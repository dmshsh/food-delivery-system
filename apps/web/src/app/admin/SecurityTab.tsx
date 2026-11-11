'use client';

import { useState } from 'react';
import { SEVERITY_STYLE, errorMessage, formatDateTime, humanEvent } from '@/lib/format';
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
];

const SEVERITIES: Severity[] = ['INFO', 'WARNING', 'CRITICAL'];

export default function SecurityTab() {
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const { data, isLoading, error } = useSecurityJournalQuery({ kind, severity }, { pollingInterval: 10000 });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Security journal</h2>
          <p className="text-sm text-stone-600">
            Every sign-in, refusal and administrative change, newest first. The journal is written by the server and
            cannot be edited from here.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="kind" className="label">Event</label>
            <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All</option>
              {KINDS.map((k) => <option key={k} value={k}>{humanEvent(k)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="severity" className="label">Importance</label>
            <select id="severity" className="input" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
              <option value="">All</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
            </select>
          </div>
        </div>
      </div>

      {data && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {SEVERITIES.map((s) => (
            <div key={s} className="card">
              <dt className="text-sm text-stone-600">{s.toLowerCase()} · last 24 hours</dt>
              <dd className="text-2xl font-semibold">{data.last24h[s] ?? 0}</dd>
            </div>
          ))}
        </dl>
      )}

      {isLoading && <p className="mt-4 text-stone-500">Loading…</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{errorMessage(error)}</p>}

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Event</th>
              <th className="px-4 py-2">Who</th>
              <th className="px-4 py-2">From</th>
              <th className="px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {data && data.events.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-stone-500">Nothing recorded for this filter.</td></tr>
            )}
            {(data?.events ?? []).map((e) => (
              <tr key={e.id} className="border-t border-stone-100 align-top">
                <td className="whitespace-nowrap px-4 py-2">{formatDateTime(e.createdAt)}</td>
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
