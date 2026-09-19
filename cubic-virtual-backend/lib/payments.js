const crypto = require('crypto');

const { db } = require('./db');
const { requireAuth, requireRole, sendError } = require('./auth');
const { validatePaymentPayload, buildBeneficiary } = require('./validation');
const { consumeQuote } = require('./fx');
const { getCached, cacheResult } = require('./idempotency');

function toSummary(p) {
  return {
    id: p.id,
    reference: p.reference,
    type: p.type,
    status: p.status,
    debtorAccountMasked: p.debtorAccount.masked,
    beneficiaryName: p.beneficiary.name,
    currency: p.currency,
    amount: p.amount,
    makerUserId: p.makerUserId,
    makerName: p.makerName,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    rowVersion: p.rowVersion,
  };
}

// A payment whose remittance narrative is exactly this marker always fails
// its next mutating call with a 500 - a deterministic hook for exercising
// the error-handling UI on demand instead of relying on random flakiness.
function maybeTrigger500(payment, res) {
  if (payment?.remittanceInformation === 'TRIGGER_500') {
    sendError(res, 500, 'UNEXPECTED_ERROR', 'Request could not be completed.');
    return true;
  }
  return false;
}

function list(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { page = '1', pageSize = '20', sort = 'createdAt', direction = 'desc', q, status, type, currency, dateFrom, dateTo } = req.query;

  let items = db.get('payments').value();

  if (status) items = items.filter((p) => p.status === status);
  if (type) items = items.filter((p) => p.type === type);
  if (currency) items = items.filter((p) => p.currency === currency);
  if (dateFrom) items = items.filter((p) => p.createdAt.slice(0, 10) >= dateFrom);
  if (dateTo) items = items.filter((p) => p.createdAt.slice(0, 10) <= dateTo);
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(
      (p) => p.reference.toLowerCase().includes(needle) || p.beneficiary.name.toLowerCase().includes(needle),
    );
  }

  const dir = direction === 'asc' ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });

  const total = sorted.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
  const start = (pageNum - 1) * size;

  res.json({ items: sorted.slice(start, start + size).map(toSummary), total, page: pageNum, pageSize: size });
}

function getOne(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const payment = db.get('payments').find({ id: req.params.id }).value();
  if (!payment) return sendError(res, 404, 'NOT_FOUND', 'Payment not found.');
  res.json(payment);
}

function validateAccountAndFx(body, errors) {
  const account = db.get('accounts').find({ id: body.debtorAccountId }).value();
  if (!account) {
    errors.debtorAccountId = 'Unknown debit account.';
    return null;
  }
  if (account.currency !== body.currency) {
    const check = body.fxQuoteId ? consumeQuote(body.fxQuoteId) : { ok: false, reason: 'missing' };
    if (!check.ok) {
      errors.fxQuoteId = check.reason === 'expired' ? 'FX quote has expired.' : 'A valid FX quote is required for cross-currency payments.';
    }
  }
  return account;
}

function create(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireRole(req, res, user, ['MAKER'])) return;

  const cached = getCached(req.body.clientRequestId);
  if (cached) return res.status(cached.status).json(cached.body);

  const errors = validatePaymentPayload(req.body);
  const account = validateAccountAndFx(req.body, errors);

  if (Object.keys(errors).length) {
    const result = { status: 422, body: { code: 'VALIDATION_ERROR', message: 'Validation failed.', fieldErrors: errors } };
    cacheResult(req.body.clientRequestId, result);
    return res.status(422).json(result.body);
  }

  const now = new Date().toISOString();
  const payment = {
    id: `pmt-${crypto.randomUUID()}`,
    reference: `PAY-${now.slice(0, 4)}-${crypto.randomInt(100000, 999999)}`,
    type: req.body.type,
    status: 'DRAFT',
    makerUserId: user.userId,
    makerName: user.displayName,
    debtorAccount: { id: account.id, masked: account.masked, full: account.iban, currency: account.currency },
    beneficiary: buildBeneficiary(req.body),
    currency: req.body.currency,
    amount: req.body.amount,
    executionDate: req.body.executionDate,
    purposeCode: req.body.purposeCode,
    remittanceInformation: req.body.remittanceInformation,
    ...(req.body.type === 'INTERNATIONAL' ? { chargeOption: req.body.chargeOption } : {}),
    rowVersion: 1,
    createdAt: now,
    updatedAt: now,
    audit: [{ event: 'CREATED', actorId: user.userId, actorName: user.displayName, at: now }],
  };

  db.get('payments').push(payment).write();

  const result = { status: 201, body: { id: payment.id, reference: payment.reference, status: payment.status, makerUserId: payment.makerUserId, rowVersion: payment.rowVersion } };
  cacheResult(req.body.clientRequestId, result);
  res.status(201).json(result.body);
}

function update(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireRole(req, res, user, ['MAKER'])) return;

  const cached = getCached(req.body.clientRequestId);
  if (cached) return res.status(cached.status).json(cached.body);

  const paymentsCol = db.get('payments');
  const payment = paymentsCol.find({ id: req.params.id }).value();
  if (!payment) return sendError(res, 404, 'NOT_FOUND', 'Payment not found.');
  if (payment.makerUserId !== user.userId) return sendError(res, 403, 'FORBIDDEN', 'You are not entitled to edit this payment.');
  if (maybeTrigger500(payment, res)) return;

  if (req.body.rowVersion !== payment.rowVersion) {
    return sendError(res, 409, 'STALE_VERSION', 'Payment has been changed by another user.', { currentRowVersion: payment.rowVersion });
  }
  if (!['DRAFT', 'RETURNED'].includes(payment.status)) {
    return sendError(res, 422, 'VALIDATION_ERROR', `Payment cannot be edited while in ${payment.status} status.`);
  }

  const errors = validatePaymentPayload(req.body);
  const account = validateAccountAndFx(req.body, errors);

  if (Object.keys(errors).length) {
    const result = { status: 422, body: { code: 'VALIDATION_ERROR', message: 'Validation failed.', fieldErrors: errors } };
    cacheResult(req.body.clientRequestId, result);
    return res.status(422).json(result.body);
  }

  const now = new Date().toISOString();
  Object.assign(payment, {
    type: req.body.type,
    debtorAccount: { id: account.id, masked: account.masked, full: account.iban, currency: account.currency },
    beneficiary: buildBeneficiary(req.body),
    currency: req.body.currency,
    amount: req.body.amount,
    executionDate: req.body.executionDate,
    purposeCode: req.body.purposeCode,
    remittanceInformation: req.body.remittanceInformation,
    updatedAt: now,
    rowVersion: payment.rowVersion + 1,
  });
  if (req.body.type === 'INTERNATIONAL') payment.chargeOption = req.body.chargeOption;
  else delete payment.chargeOption;

  payment.audit.push({ event: 'UPDATED', actorId: user.userId, actorName: user.displayName, at: now });
  paymentsCol.write();

  const result = { status: 200, body: { id: payment.id, reference: payment.reference, status: payment.status, makerUserId: payment.makerUserId, rowVersion: payment.rowVersion } };
  cacheResult(req.body.clientRequestId, result);
  res.json(result.body);
}

function submit(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireRole(req, res, user, ['MAKER'])) return;

  const cached = getCached(req.body.clientRequestId);
  if (cached) return res.status(cached.status).json(cached.body);

  const paymentsCol = db.get('payments');
  const payment = paymentsCol.find({ id: req.params.id }).value();
  if (!payment) return sendError(res, 404, 'NOT_FOUND', 'Payment not found.');
  if (payment.makerUserId !== user.userId) return sendError(res, 403, 'FORBIDDEN', 'You are not entitled to submit this payment.');
  if (maybeTrigger500(payment, res)) return;

  if (req.body.rowVersion !== payment.rowVersion) {
    return sendError(res, 409, 'STALE_VERSION', 'Payment has been changed by another user.', { currentRowVersion: payment.rowVersion });
  }
  if (!['DRAFT', 'RETURNED'].includes(payment.status)) {
    return sendError(res, 422, 'VALIDATION_ERROR', `Payment cannot be submitted while in ${payment.status} status.`);
  }

  const now = new Date().toISOString();
  payment.status = 'PENDING_CHECK';
  payment.updatedAt = now;
  payment.rowVersion += 1;
  payment.audit.push({ event: 'SUBMITTED', actorId: user.userId, actorName: user.displayName, at: now });
  paymentsCol.write();

  const result = { status: 200, body: { id: payment.id, reference: payment.reference, status: payment.status, makerUserId: payment.makerUserId, rowVersion: payment.rowVersion } };
  cacheResult(req.body.clientRequestId, result);
  res.json(result.body);
}

// Not part of the documented contract in section 2, but section 1.4 requires
// "Cancel Draft" as a Maker action and the contract table has no endpoint for
// it. Mirrors submit's request/response shape rather than overloading PUT.
function cancel(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireRole(req, res, user, ['MAKER'])) return;

  const cached = getCached(req.body.clientRequestId);
  if (cached) return res.status(cached.status).json(cached.body);

  const paymentsCol = db.get('payments');
  const payment = paymentsCol.find({ id: req.params.id }).value();
  if (!payment) return sendError(res, 404, 'NOT_FOUND', 'Payment not found.');
  if (payment.makerUserId !== user.userId) return sendError(res, 403, 'FORBIDDEN', 'You are not entitled to cancel this payment.');
  if (maybeTrigger500(payment, res)) return;

  if (req.body.rowVersion !== payment.rowVersion) {
    return sendError(res, 409, 'STALE_VERSION', 'Payment has been changed by another user.', { currentRowVersion: payment.rowVersion });
  }
  if (payment.status !== 'DRAFT') {
    return sendError(res, 422, 'VALIDATION_ERROR', `Only Draft payments can be cancelled (current status: ${payment.status}).`);
  }

  const now = new Date().toISOString();
  payment.status = 'CANCELLED';
  payment.updatedAt = now;
  payment.rowVersion += 1;
  payment.audit.push({ event: 'CANCELLED', actorId: user.userId, actorName: user.displayName, at: now });
  paymentsCol.write();

  const result = { status: 200, body: { id: payment.id, reference: payment.reference, status: payment.status, makerUserId: payment.makerUserId, rowVersion: payment.rowVersion } };
  cacheResult(req.body.clientRequestId, result);
  res.json(result.body);
}

function decide(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireRole(req, res, user, ['CHECKER'])) return;

  const cached = getCached(req.body.clientRequestId);
  if (cached) return res.status(cached.status).json(cached.body);

  const paymentsCol = db.get('payments');
  const payment = paymentsCol.find({ id: req.params.id }).value();
  if (!payment) return sendError(res, 404, 'NOT_FOUND', 'Payment not found.');
  if (maybeTrigger500(payment, res)) return;

  const { decision, reason } = req.body;
  if (!['APPROVE', 'RETURN', 'REJECT'].includes(decision)) {
    return sendError(res, 422, 'VALIDATION_ERROR', 'Validation failed.', { fieldErrors: { decision: 'Invalid decision.' } });
  }
  if (decision === 'APPROVE' && payment.makerUserId === user.userId) {
    return sendError(res, 403, 'FORBIDDEN', 'You cannot approve a payment you created.');
  }
  if (decision !== 'APPROVE' && !reason?.trim()) {
    return sendError(res, 422, 'VALIDATION_ERROR', 'Validation failed.', { fieldErrors: { reason: 'A reason is required.' } });
  }
  if (req.body.rowVersion !== payment.rowVersion) {
    return sendError(res, 409, 'STALE_VERSION', 'Payment has been changed by another user.', { currentRowVersion: payment.rowVersion });
  }
  if (payment.status !== 'PENDING_CHECK') {
    return sendError(res, 422, 'VALIDATION_ERROR', `Payment cannot be decided while in ${payment.status} status.`);
  }

  const statusByDecision = { APPROVE: 'APPROVED', RETURN: 'RETURNED', REJECT: 'REJECTED' };
  const now = new Date().toISOString();
  payment.status = statusByDecision[decision];
  payment.updatedAt = now;
  payment.rowVersion += 1;
  payment.audit.push({
    event: statusByDecision[decision],
    actorId: user.userId,
    actorName: user.displayName,
    at: now,
    ...(reason ? { reason } : {}),
  });
  paymentsCol.write();

  const result = { status: 200, body: { id: payment.id, reference: payment.reference, status: payment.status, rowVersion: payment.rowVersion, decisionBy: user.userId } };
  cacheResult(req.body.clientRequestId, result);
  res.json(result.body);
}

module.exports = { list, getOne, create, update, submit, cancel, decide };
