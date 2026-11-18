'use client';

import { useState } from 'react';
import { useSession } from '@/components/useSession';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateTime, roleKey, translateError } from '@/lib/format';
import type { AdminUser, Role } from '@/lib/types';
import { useAdminUsersQuery, useSetAccessMutation, useSetUserRoleMutation } from '@/store/api';

const ROLES: Role[] = ['CUSTOMER', 'KITCHEN', 'ACCOUNTANT', 'ADMIN'];

export default function UsersTab() {
  const { t, lang } = useI18n();
  const { user: me } = useSession();
  const { data, isLoading, error } = useAdminUsersQuery();
  const [setAccess, access] = useSetAccessMutation();
  const [setUserRole] = useSetUserRoleMutation();
  const [message, setMessage] = useState('');
  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');

  async function unblock(user: AdminUser) {
    setMessage('');
    try {
      await setAccess({ id: user.id, action: 'unblock', reason: '' }).unwrap();
      setMessage(t('admin.unblocked', { email: user.email }));
    } catch (e) {
      setMessage(translateError(e, t));
    }
  }

  async function confirmBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blocking) return;
    setMessage('');
    try {
      await setAccess({ id: blocking.id, action: 'block', reason: reason.trim() }).unwrap();
      setMessage(t('admin.wasBlocked', { email: blocking.email }));
      setBlocking(null);
      setReason('');
    } catch (err) {
      setMessage(translateError(err, t));
    }
  }

  async function changeRole(user: AdminUser, role: Role) {
    setMessage('');
    try {
      await setUserRole({ id: user.id, role }).unwrap();
      setMessage(t('admin.roleChanged', { email: user.email, role: t(roleKey(role)) }));
    } catch (e) {
      setMessage(translateError(e, t));
    }
  }

  if (isLoading) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (error != null) return <p role="alert" className="text-red-700">{translateError(error, t)}</p>;

  return (
    <div>
      <h2 className="text-lg font-medium">{t('admin.accounts')}</h2>
      <p className="text-sm text-stone-600">{t('admin.usersHint')}</p>

      {message && (
        <p role="status" className="mt-3 rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">{message}</p>
      )}

      {blocking && (
        <form onSubmit={confirmBlock} className="card mt-3 border-red-300 bg-red-50">
          <h3 className="font-medium">{t('admin.blockTitle', { name: blocking.fullName, email: blocking.email })}</h3>
          <label htmlFor="reason" className="label mt-2">{t('admin.blockReason')}</label>
          <input
            id="reason"
            className="input"
            required
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('admin.blockReasonHint')}
          />
          <div className="mt-3 flex gap-2">
            <button className="btn-danger" disabled={access.isLoading}>{t('admin.blockConfirm')}</button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setBlocking(null);
                setReason('');
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="px-4 py-2">{t('admin.user')}</th>
              <th className="px-4 py-2">{t('admin.roleColumn')}</th>
              <th className="px-4 py-2">{t('admin.stateColumn')}</th>
              <th className="px-4 py-2 text-right">{t('admin.ordersTotal')}</th>
              <th className="px-4 py-2 text-right">{t('bonus.pointsColumn')}</th>
              <th className="px-4 py-2">{t('admin.accessColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u) => {
              const self = me?.id === u.id;
              const lockedOut = u.blockedUntil !== null && new Date(u.blockedUntil).getTime() > Date.now();
              return (
                <tr key={u.id} className={`border-t border-stone-100 ${u.isActive ? '' : 'bg-red-50'}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {u.fullName}
                      {self && <span className="ml-2 text-xs text-stone-500">{t('admin.you')}</span>}
                    </div>
                    <div className="text-xs text-stone-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="input py-1"
                      aria-label={t('admin.roleColumn')}
                      value={u.role}
                      disabled={self}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{t(roleKey(r))}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {!u.isActive && (
                      <span className="rounded bg-red-200 px-2 py-0.5 text-xs text-red-900">{t('admin.blocked')}</span>
                    )}
                    {u.isActive && lockedOut && (
                      <span className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-900">
                        {t('admin.lockedUntil', { date: formatDateTime(u.blockedUntil as string, lang) })}
                      </span>
                    )}
                    {u.isActive && !lockedOut && <span className="text-stone-500">{t('admin.active')}</span>}
                    {u.blockReason && <div className="mt-1 text-xs text-stone-500">{u.blockReason}</div>}
                    {u.failedAttempts > 0 && (
                      <div className="mt-1 text-xs text-amber-700">
                        {t('admin.failedSignIns', { count: u.failedAttempts })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{u.orderCount}</td>
                  <td className="px-4 py-2 text-right">{u.bonusPoints ?? '—'}</td>
                  <td className="px-4 py-2">
                    {self ? (
                      <span className="text-xs text-stone-500">{t('admin.cannotBlockSelf')}</span>
                    ) : u.isActive && !lockedOut ? (
                      <button className="btn-danger" onClick={() => setBlocking(u)}>{t('admin.block')}</button>
                    ) : (
                      <button className="btn-secondary" disabled={access.isLoading} onClick={() => unblock(u)}>
                        {t('admin.unblock')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
