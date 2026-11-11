'use client';

import { useState } from 'react';
import RequireRole from '@/components/RequireRole';
import FeedbackTab from './FeedbackTab';
import MenuTab from './MenuTab';
import OverviewTab from './OverviewTab';
import SecurityTab from './SecurityTab';
import UsersTab from './UsersTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'menu', label: 'Menu' },
  { id: 'users', label: 'Users' },
  { id: 'security', label: 'Security journal' },
  { id: 'feedback', label: 'Reviews' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AdminPage() {
  return (
    <RequireRole roles={['ADMIN']}>
      <Admin />
    </RequireRole>
  );
}

function Admin() {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin panel</h1>
      <p className="mt-1 text-sm text-stone-600">
        The menu, the accounts, what the system recorded about access, and what customers thought of their orders.
      </p>

      <div className="mt-5 flex flex-wrap gap-2 border-b border-stone-200 pb-3" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'btn-primary' : 'btn-secondary'}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'menu' && <MenuTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'feedback' && <FeedbackTab />}
      </div>
    </div>
  );
}
