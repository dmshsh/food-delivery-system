'use client';

import { useState } from 'react';
import { useSession } from '@/components/useSession';
import { ROLE_LABEL, errorMessage, formatDateTime } from '@/lib/format';
import type { AdminUser, Role } from '@/lib/types';
import { useAdminUsersQuery, useSetAccessMutation, useSetUserRoleMutation } from '@/store/api';

const ROLES: Role[] = ['CUSTOMER', 'KITCHEN', 'ACCOUNTANT', 'ADMIN'];

export default function UsersTab() {
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
      setMessage(`${user.email} can sign in again.`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function confirmBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blocking) return;
    setMessage('');
    try {
      await setAccess({ id: blocking.id, action: 'block', reason: reason.trim() }).unwrap();
      setMessage(`${blocking.email} is blocked. The reason was written to the security journal.`);
      setBlocking(null);
      setReason('');
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function changeRole(user: AdminUser, role: Role) {
    setMessage('');
    try {
      await setUserRole({ id: user.id, role }).unwrap();
      setMessage(`${user.email} is now ${ROLE_LABEL[role].toLowerCase()}.`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  if (error != null) return <p role="alert" className="text-red-700">{errorMessage(error)}</p>;

  return (
    <div>
      <h2 className="text-lg font-medium">Accounts</h2>
      <p className="text-sm text-stone-600">
        A blocked account cannot sign in, and a session already open stops working on its next request.
      </p>

      {message && (
        <p role="status" className="mt-3 rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">{message}</p>
      )}

      {blocking && (
        <form onSubmit={confirmBlock} className="card mt-3 border-red-300 bg-red-50">
          <h3 className="font-medium">Block {blocking.fullName} ({blocking.email})</h3>
          <label htmlFor="reason" className="label mt-2">Why? (kept in the security journal)</label>
          <input id="reason" className="input" required maxLength={200} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="For example: repeated abusive comments" />
          <div className="mt-3 flex gap-2">
            <button className="btn-danger" disabled={access.isLoading}>Block the account</button>
            <button type="button" className="btn-secondary" onClick={() => { setBlocking(null); setReason(''); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2 text-right">Orders</th>
              <th className="px-4 py-2 text-right">Points</th>
              <th className="px-4 py-2">Access</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u) => {
              const self = me?.id === u.id;
              const lockedOut = u.blockedUntil !== null && new Date(u.blockedUntil).getTime() > Date.now();
              return (
                <tr key={u.id} className={`border-t border-stone-100 ${u.isActive ? '' : 'bg-red-50'}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{u.fullName}{self && <span className="ml-2 text-xs text-stone-500">(you)</span>}</div>
                    <div className="text-xs text-stone-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="input py-1"
                      aria-label={`Role of ${u.email}`}
                      value={u.role}
                      disabled={self}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {!u.isActive && <span className="rounded bg-red-200 px-2 py-0.5 text-xs text-red-900">blocked</span>}
                    {u.isActive && lockedOut && (
                      <span className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-900">
                        locked until {formatDateTime(u.blockedUntil as string)}
                      </span>
                    )}
                    {u.isActive && !lockedOut && <span className="text-stone-500">active</span>}
                    {u.blockReason && <div className="mt-1 text-xs text-stone-500">{u.blockReason}</div>}
                    {u.failedAttempts > 0 && (
                      <div className="mt-1 text-xs text-amber-700">{u.failedAttempts} failed sign-in(s)</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{u.orderCount}</td>
                  <td className="px-4 py-2 text-right">{u.bonusPoints ?? '—'}</td>
                  <td className="px-4 py-2">
                    {self ? (
                      <span className="text-xs text-stone-500">you cannot block yourself</span>
                    ) : u.isActive && !lockedOut ? (
                      <button className="btn-danger" onClick={() => setBlocking(u)}>Block</button>
                    ) : (
                      <button className="btn-secondary" disabled={access.isLoading} onClick={() => unblock(u)}>Unblock</button>
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
