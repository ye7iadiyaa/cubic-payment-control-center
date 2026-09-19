const crypto = require('crypto');
const Papa = require('papaparse');

const { db } = require('./db');
const { requireAuth, requireRole, sendError } = require('./auth');
const { referenceData } = require('./validation');
const { todayISO } = require('./dates');

const SWIFT_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

// The CSV columns in section 1.6 don't include a debit account or a
// DOMESTIC/INTERNATIONAL type. We ask the maker to pick one debit account for
// the whole batch (sent as a form field alongside the file) and infer the
// per-row type from whether bankCodeOrSwift looks like a SWIFT/BIC.
function handleBulkUpload(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireRole(req, res, user, ['MAKER'])) return;

  if (!req.file) return sendError(res, 422, 'VALIDATION_ERROR', 'A CSV file is required.');
  const account = db.get('accounts').find({ id: req.body.debtorAccountId }).value();
  if (!account) {
    return sendError(res, 422, 'VALIDATION_ERROR', 'A valid debit account is required.', {
      fieldErrors: { debtorAccountId: 'Unknown debit account.' },
    });
  }

  const parsed = Papa.parse(req.file.buffer.toString('utf8'), { header: true, skipEmptyLines: true });
  const ref = referenceData();
  const existingRefs = new Set(db.get('payments').map('clientReference').value().filter(Boolean));
  const seenInFile = new Set();

  const rejectedRows = [];
  const accepted = [];

  parsed.data.forEach((row, index) => {
    const rowNumber = index + 2; // header occupies row 1
    const clientReference = (row.clientReference || '').trim();
    const reject = (code, message) => rejectedRows.push({ row: rowNumber, clientReference, code, message });

    if (!clientReference) return reject('MISSING_REFERENCE', 'clientReference is required.');
    if (seenInFile.has(clientReference) || existingRefs.has(clientReference)) {
      return reject('DUPLICATE_REFERENCE', `Duplicate clientReference: ${clientReference}.`);
    }
    if (!row.beneficiaryName?.trim()) return reject('MISSING_BENEFICIARY_NAME', 'beneficiaryName is required.');
    if (!row.beneficiaryAccount?.trim()) return reject('MISSING_BENEFICIARY_ACCOUNT', 'beneficiaryAccount is required.');
    if (!row.bankCodeOrSwift?.trim()) return reject('MISSING_BANK_CODE', 'bankCodeOrSwift is required.');

    const currency = ref.currencies.find((c) => c.code === row.currency);
    if (!currency) return reject('INVALID_CURRENCY', `Unknown currency: ${row.currency}.`);

    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) return reject('INVALID_AMOUNT', 'Amount must be greater than zero.');

    if (!row.executionDate || row.executionDate < todayISO()) {
      return reject('INVALID_EXECUTION_DATE', 'Execution date must be today or later.');
    }
    if (!row.purposeCode || !ref.purposeCodes.includes(row.purposeCode)) {
      return reject('INVALID_PURPOSE_CODE', `Unknown purpose code: ${row.purposeCode}.`);
    }

    seenInFile.add(clientReference);
    accepted.push({
      row,
      clientReference,
      currency,
      amount,
      isInternational: SWIFT_RE.test(row.bankCodeOrSwift.trim().toUpperCase()),
    });
  });

  const now = new Date().toISOString();
  const paymentsCol = db.get('payments');

  accepted.forEach(({ row, clientReference, currency, amount, isInternational }) => {
    paymentsCol
      .push({
        id: `pmt-${crypto.randomUUID()}`,
        reference: `PAY-${now.slice(0, 4)}-${crypto.randomInt(100000, 999999)}`,
        clientReference,
        type: isInternational ? 'INTERNATIONAL' : 'DOMESTIC',
        status: 'DRAFT',
        makerUserId: user.userId,
        makerName: user.displayName,
        debtorAccount: { id: account.id, masked: account.masked, full: account.iban, currency: account.currency },
        beneficiary: isInternational
          ? { name: row.beneficiaryName.trim(), account: row.beneficiaryAccount.trim(), swift: row.bankCodeOrSwift.trim().toUpperCase(), country: '', address: '' }
          : { name: row.beneficiaryName.trim(), account: row.beneficiaryAccount.trim(), bankCode: row.bankCodeOrSwift.trim() },
        currency: currency.code,
        amount,
        executionDate: row.executionDate,
        purposeCode: row.purposeCode,
        remittanceInformation: `Bulk upload ${clientReference}`,
        rowVersion: 1,
        createdAt: now,
        updatedAt: now,
        audit: [{ event: 'CREATED', actorId: user.userId, actorName: user.displayName, at: now }],
      })
      .write();
  });

  res.status(201).json({
    batchId: crypto.randomUUID(),
    receivedRows: parsed.data.length,
    acceptedRows: accepted.length,
    rejectedRows,
    status: rejectedRows.length === 0 ? 'ACCEPTED' : 'PARTIALLY_ACCEPTED',
  });
}

module.exports = { handleBulkUpload };
