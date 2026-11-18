'use client';

import { useT } from '@/i18n/I18nProvider';
import { STATUS_STYLE, statusKey } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

export default function StatusBadge({ status }: { status: OrderStatus }) {
  const t = useT();
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {t(statusKey(status))}
    </span>
  );
}
