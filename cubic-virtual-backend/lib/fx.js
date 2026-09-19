const crypto = require('crypto');

const BASE_RATES = {
  'KWD-USD': 3.25,
  'USD-KWD': 1 / 3.25,
  'KWD-EUR': 3.0,
  'EUR-KWD': 1 / 3.0,
  'KWD-GBP': 4.1,
  'GBP-KWD': 1 / 4.1,
  'USD-EUR': 0.92,
  'EUR-USD': 1.08,
  'USD-GBP': 0.79,
  'GBP-USD': 1.27,
  'EUR-GBP': 0.86,
  'GBP-EUR': 1.16,
};

const QUOTE_TTL_MS = 30_000;
const quotes = new Map();

function rateFor(source, target) {
  if (source === target) return 1;
  const base = BASE_RATES[`${source}-${target}`] ?? 1;
  const jitter = 1 + (Math.random() - 0.5) * 0.01; // +/- 0.5%
  return Number((base * jitter).toFixed(6));
}

function createQuote({ debitAccountId, sourceCurrency, targetCurrency, targetAmount }) {
  const rate = rateFor(sourceCurrency, targetCurrency);
  const debitAmount = Number((targetAmount / rate).toFixed(2));
  const quote = {
    quoteId: crypto.randomUUID(),
    sourceCurrency,
    targetCurrency,
    rate,
    targetAmount,
    debitAmount,
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  };
  quotes.set(quote.quoteId, { ...quote, debitAccountId });
  return quote;
}

function consumeQuote(quoteId) {
  const quote = quotes.get(quoteId);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (new Date(quote.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, quote };
}

module.exports = { createQuote, consumeQuote };
