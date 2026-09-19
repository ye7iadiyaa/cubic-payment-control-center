import { PaymentStatus } from '../../core/models/payment.model';

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'DRAFT',
  'PENDING_CHECK',
  'RETURNED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const SEVERITY_BY_STATUS: Record<PaymentStatus, TagSeverity> = {
  DRAFT: 'secondary',
  PENDING_CHECK: 'info',
  RETURNED: 'warn',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'contrast',
};

export function statusSeverity(status: PaymentStatus): TagSeverity {
  return SEVERITY_BY_STATUS[status];
}

export function statusLabel(status: PaymentStatus): string {
  return status.replace('_', ' ');
}
