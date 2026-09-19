import { PaymentType } from './payment.model';

export interface Beneficiary {
  id: string;
  name: string;
  type: PaymentType;
  account: string;
  bankCode?: string;
  swift?: string;
  country?: string;
  address?: string;
}
