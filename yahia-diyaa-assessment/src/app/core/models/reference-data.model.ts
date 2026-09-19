import { ChargeOption, PaymentType } from './payment.model';

export interface Currency {
  code: string;
  minorUnits: number;
}

export interface ReferenceData {
  currencies: Currency[];
  paymentTypes: PaymentType[];
  purposeCodes: string[];
  chargeOptions: ChargeOption[];
}
