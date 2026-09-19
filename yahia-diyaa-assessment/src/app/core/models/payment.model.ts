export type PaymentType = 'DOMESTIC' | 'INTERNATIONAL';

export type PaymentStatus =
  | 'DRAFT'
  | 'PENDING_CHECK'
  | 'RETURNED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type Decision = 'APPROVE' | 'RETURN' | 'REJECT';

export type ChargeOption = 'SHA' | 'OUR' | 'BEN';

export interface PaymentSummary {
  id: string;
  reference: string;
  type: PaymentType;
  status: PaymentStatus;
  debtorAccountMasked: string;
  beneficiaryName: string;
  currency: string;
  amount: number;
  makerUserId: string;
  makerName: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface PaymentListResponse {
  items: PaymentSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaymentBeneficiary {
  id?: string;
  name: string;
  account: string;
  bankCode?: string;
  swift?: string;
  country?: string;
  address?: string;
}

export interface PaymentDetail {
  id: string;
  reference: string;
  type: PaymentType;
  status: PaymentStatus;
  makerUserId: string;
  makerName: string;
  debtorAccount: {
    id: string;
    masked: string;
    full: string;
    currency: string;
  };
  beneficiary: PaymentBeneficiary;
  currency: string;
  amount: number;
  executionDate: string;
  purposeCode: string;
  remittanceInformation: string;
  chargeOption?: ChargeOption;
  rowVersion: number;
  audit: AuditEvent[];
}

export interface AuditEvent {
  event: 'CREATED' | 'UPDATED' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  actorId: string;
  actorName: string;
  at: string;
  reason?: string;
}

export interface PaymentQueryParams {
  page: number;
  pageSize: number;
  sort?: string;
  direction?: 'asc' | 'desc';
  q?: string;
  status?: PaymentStatus;
  type?: PaymentType;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaymentPayload {
  clientRequestId: string;
  type: PaymentType;
  debtorAccountId: string;
  beneficiary: PaymentBeneficiary;
  currency: string;
  amount: number;
  executionDate: string;
  purposeCode: string;
  remittanceInformation: string;
  chargeOption?: ChargeOption;
  fxQuoteId?: string;
  rowVersion?: number;
}

export interface PaymentMutationResponse {
  id: string;
  reference: string;
  status: PaymentStatus;
  makerUserId: string;
  rowVersion: number;
}

export interface DecisionResponse {
  id: string;
  reference: string;
  status: PaymentStatus;
  rowVersion: number;
  decisionBy: string;
}
