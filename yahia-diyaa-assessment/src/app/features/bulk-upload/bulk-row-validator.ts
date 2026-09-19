import { ReferenceData } from '../../core/models/reference-data.model';

export interface BulkRow {
  rowNumber: number;
  clientReference: string;
  beneficiaryName: string;
  beneficiaryAccount: string;
  bankCodeOrSwift: string;
  currency: string;
  amount: number | null;
  executionDate: string;
  purposeCode: string;
  errors: string[];
}

export const SWIFT_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export function isSwiftLike(value: string): boolean {
  return SWIFT_RE.test(value.toUpperCase());
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function validateBulkRow(
  raw: Record<string, string>,
  rowNumber: number,
  referenceData: ReferenceData | null,
  seenReferences: Set<string>,
): BulkRow {
  const errors: string[] = [];
  const clientReference = (raw['clientReference'] ?? '').trim();
  const beneficiaryName = (raw['beneficiaryName'] ?? '').trim();
  const beneficiaryAccount = (raw['beneficiaryAccount'] ?? '').trim();
  const bankCodeOrSwift = (raw['bankCodeOrSwift'] ?? '').trim();
  const currency = (raw['currency'] ?? '').trim();
  const executionDate = (raw['executionDate'] ?? '').trim();
  const purposeCode = (raw['purposeCode'] ?? '').trim();
  const amountRaw = (raw['amount'] ?? '').trim();
  const amount = amountRaw === '' ? null : Number(amountRaw);

  if (!clientReference) errors.push('clientReference is required.');
  else if (seenReferences.has(clientReference)) errors.push('Duplicate clientReference in this file.');
  seenReferences.add(clientReference);

  if (!beneficiaryName) errors.push('beneficiaryName is required.');
  if (!beneficiaryAccount) errors.push('beneficiaryAccount is required.');
  if (!bankCodeOrSwift) errors.push('bankCodeOrSwift is required.');

  const currencyRef = referenceData?.currencies.find((c) => c.code === currency);
  if (!currencyRef) {
    errors.push('Unknown currency.');
  }

  if (amount == null || Number.isNaN(amount) || amount <= 0) {
    errors.push('Amount must be greater than zero.');
  } else if (currencyRef) {
    const factor = 10 ** currencyRef.minorUnits;
    if (Math.round(amount * factor) / factor !== amount) {
      errors.push(`Amount cannot have more than ${currencyRef.minorUnits} decimal place(s) for ${currencyRef.code}.`);
    }
  }

  if (!executionDate || Number.isNaN(Date.parse(executionDate))) {
    errors.push('executionDate is required and must be a valid date.');
  } else if (executionDate < todayIso()) {
    errors.push('executionDate cannot be in the past.');
  }

  if (!purposeCode || !referenceData?.purposeCodes.includes(purposeCode)) {
    errors.push('Unknown purposeCode.');
  }

  return {
    rowNumber,
    clientReference,
    beneficiaryName,
    beneficiaryAccount,
    bankCodeOrSwift,
    currency,
    amount,
    executionDate,
    purposeCode,
    errors,
  };
}
