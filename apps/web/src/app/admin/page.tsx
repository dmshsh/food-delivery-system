'use client';

import { useState } from 'react';
import RequireRole from '@/components/RequireRole';
import { useT } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionaries';
import FeedbackTab from './FeedbackTab';
import IpsTab from './IpsTab';
import MenuTab from './MenuTab';
import OverviewTab from './OverviewTab';
import SecurityTab from './SecurityTab';
import UsersTab from './UsersTab';

const TABS = [
  { id: 'overview', label: 'admin.tab.overview' },
  { id: 'menu', label: 'admin.tab.menu' },
  { id: 'users', label: 'admin.tab.users' },
  { id: 'security', label: 'admin.tab.security' },
  { id: 'ips', label: 'admin.tab.ips' },
  { id: 'feedback', label: 'admin.tab.feedback' },
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
  const t = useT();
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('admin.title')}</h1>
      <p className="mt-1 text-sm text-stone-600">{t('admin.subtitle')}</p>

      <div
        className="mt-5 flex flex-wrap gap-2 border-b border-stone-200 pb-3"
        role="tablist"
        aria-label={t('admin.sections')}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={tab === item.id ? 'btn-primary' : 'btn-secondary'}
          >
            {t(item.label as MessageKey)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'menu' && <MenuTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'ips' && <IpsTab />}
        {tab === 'feedback' && <FeedbackTab />}
      </div>
    </div>
  );
}
