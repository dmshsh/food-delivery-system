import { STATUS_LABEL, STATUS_STYLE } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
