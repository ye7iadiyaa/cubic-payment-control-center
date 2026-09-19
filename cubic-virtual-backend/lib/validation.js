const { db } = require('./db');
const { todayISO } = require('./dates');

function referenceData() {
  return db.get('referenceData').value();
}

function validatePaymentPayload(body) {
  const errors = {};
  const ref = referenceData();

  if (!body.type || !ref.paymentTypes.includes(body.type)) {
    errors.type = 'Payment type is required.';
  }
  if (!body.debtorAccountId) errors.debtorAccountId = 'Debit account is required.';
  if (!body.beneficiary?.name) errors['beneficiary.name'] = 'Beneficiary name is required.';
  if (!body.beneficiary?.account) errors['beneficiary.account'] = 'Beneficiary account is required.';

  if (body.type === 'INTERNATIONAL') {
    if (!body.beneficiary?.swift) errors['beneficiary.swift'] = 'SWIFT/BIC is required for international payments.';
    if (!body.beneficiary?.country) errors['beneficiary.country'] = 'Country is required for international payments.';
    if (!body.beneficiary?.address) errors['beneficiary.address'] = 'Address is required for international payments.';
    if (!body.chargeOption || !ref.chargeOptions.includes(body.chargeOption)) {
      errors.chargeOption = 'Charge option is required for international payments.';
    }
  } else if (body.type === 'DOMESTIC' && !body.beneficiary?.bankCode) {
    errors['beneficiary.bankCode'] = 'Bank code is required for domestic payments.';
  }

  const currency = ref.currencies.find((c) => c.code === body.currency);
  if (!currency) {
    errors.currency = 'Unknown currency.';
  }

  if (typeof body.amount !== 'number' || body.amount <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  } else if (currency) {
    const factor = 10 ** currency.minorUnits;
    if (Math.round(body.amount * factor) / factor !== body.amount) {
      errors.amount = `Amount cannot have more than ${currency.minorUnits} decimal place(s) for ${currency.code}.`;
    }
  }

  if (!body.executionDate) {
    errors.executionDate = 'Execution date is required.';
  } else if (body.executionDate < todayISO()) {
    errors.executionDate = 'Execution date cannot be in the past.';
  }

  if (!body.purposeCode || !ref.purposeCodes.includes(body.purposeCode)) {
    errors.purposeCode = 'A valid purpose code is required.';
  }
  if (!body.remittanceInformation) errors.remittanceInformation = 'Remittance information is required.';

  return errors;
}

function buildBeneficiary(body) {
  const b = body.beneficiary || {};
  const base = { id: b.id, name: b.name, account: b.account };
  return body.type === 'INTERNATIONAL'
    ? { ...base, swift: b.swift, country: b.country, address: b.address }
    : { ...base, bankCode: b.bankCode };
}

module.exports = { validatePaymentPayload, buildBeneficiary, referenceData };
