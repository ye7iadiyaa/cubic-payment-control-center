const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

faker.seed(20260918);

const DB_PATH = path.join(__dirname, 'db.json');

const CURRENCIES = [
  { code: 'KWD', minorUnits: 3 },
  { code: 'USD', minorUnits: 2 },
  { code: 'EUR', minorUnits: 2 },
  { code: 'GBP', minorUnits: 2 },
];

const PURPOSE_CODES = [
  'SALARY',
  'SUPPLIER_PAYMENT',
  'UTILITY',
  'TAX',
  'LOAN_REPAYMENT',
  'TRADE_SETTLEMENT',
  'DIVIDEND',
  'OTHER',
];

const CHARGE_OPTIONS = ['SHA', 'OUR', 'BEN'];

const users = [
  {
    userId: 'u-maker-1',
    displayName: 'Fatima Al-Sabah',
    role: 'MAKER',
    branchCode: 'BR01',
    entitlements: ['PAYMENTS_CREATE'],
  },
  {
    userId: 'u-maker-2',
    displayName: 'Yousef Al-Rashidi',
    role: 'MAKER',
    branchCode: 'BR02',
    entitlements: ['PAYMENTS_CREATE', 'VIEW_FULL_ACCOUNT'],
  },
  {
    userId: 'u-checker-1',
    displayName: 'Noura Al-Fahad',
    role: 'CHECKER',
    branchCode: 'BR01',
    entitlements: ['PAYMENTS_DECIDE', 'VIEW_FULL_ACCOUNT'],
  },
  {
    userId: 'u-checker-2',
    displayName: 'Omar Al-Mutairi',
    role: 'CHECKER',
    branchCode: 'BR02',
    entitlements: ['PAYMENTS_DECIDE'],
  },
  {
    userId: 'u-auditor-1',
    displayName: 'Sara Boustani',
    role: 'AUDITOR',
    branchCode: 'BR01',
    entitlements: ['VIEW_FULL_ACCOUNT'],
  },
];

const makers = users.filter((u) => u.role === 'MAKER');
const checkers = users.filter((u) => u.role === 'CHECKER');

function maskIban(iban) {
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

const accounts = CURRENCIES.flatMap((currency, i) => {
  const count = currency.code === 'KWD' ? 3 : 2;
  return Array.from({ length: count }, (_, j) => {
    const iban = faker.finance.iban({ countryCode: currency.code === 'KWD' ? 'KW' : undefined });
    return {
      id: `acc-${i}-${j}`,
      iban,
      masked: maskIban(iban),
      currency: currency.code,
      availableBalance: faker.number.float({ min: 5000, max: 900000, fractionDigits: currency.minorUnits }),
      status: 'ACTIVE',
    };
  });
});

const beneficiaries = Array.from({ length: 25 }, (_, i) => {
  const isInternational = i % 3 === 0;
  const name = faker.company.name();
  const account = isInternational
    ? faker.finance.iban()
    : faker.finance.iban({ countryCode: 'KW' });
  return {
    id: `ben-${i + 1}`,
    name,
    type: isInternational ? 'INTERNATIONAL' : 'DOMESTIC',
    account,
    ...(isInternational
      ? {
          swift: faker.finance.bic(),
          country: faker.location.countryCode(),
          address: faker.location.streetAddress(true),
        }
      : { bankCode: faker.finance.routingNumber() }),
  };
});

const STATUS_WEIGHTS = [
  ['DRAFT', 0.15],
  ['PENDING_CHECK', 0.25],
  ['APPROVED', 0.4],
  ['RETURNED', 0.08],
  ['REJECTED', 0.07],
  ['CANCELLED', 0.05],
];

function pickStatus() {
  const r = Math.random();
  let acc = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    acc += weight;
    if (r <= acc) return status;
  }
  return 'APPROVED';
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildAudit(status, createdAt, maker, checker) {
  const audit = [{ event: 'CREATED', actorId: maker.userId, actorName: maker.displayName, at: createdAt }];
  let rowVersion = 1;
  let at = createdAt;

  const advance = (event, actor, extra = {}) => {
    at = faker.date.soon({ days: 5, refDate: at }).toISOString();
    rowVersion += 1;
    audit.push({ event, actorId: actor.userId, actorName: actor.displayName, at, ...extra });
  };

  if (status === 'DRAFT') return { audit, rowVersion, updatedAt: createdAt };

  advance('SUBMITTED', maker);
  if (status === 'PENDING_CHECK') return { audit, rowVersion, updatedAt: at };

  if (status === 'RETURNED') {
    advance('RETURNED', checker, { reason: 'Beneficiary details need confirmation.' });
  } else if (status === 'REJECTED') {
    advance('REJECTED', checker, { reason: 'Does not meet compliance requirements.' });
  } else if (status === 'CANCELLED') {
    audit.pop();
    rowVersion -= 1;
    at = faker.date.soon({ days: 2, refDate: createdAt }).toISOString();
    rowVersion += 1;
    audit.push({ event: 'CANCELLED', actorId: maker.userId, actorName: maker.displayName, at });
  } else if (status === 'APPROVED') {
    advance('APPROVED', checker);
  }

  return { audit, rowVersion, updatedAt: at };
}

function buildPayment(index, overrides = {}) {
  const currency = faker.helpers.arrayElement(CURRENCIES);
  const debtorAccount = faker.helpers.arrayElement(accounts);
  const type = overrides.type ?? faker.helpers.arrayElement(['DOMESTIC', 'INTERNATIONAL']);
  const eligibleBeneficiaries = beneficiaries.filter((b) => b.type === type);
  const beneficiary = faker.helpers.arrayElement(eligibleBeneficiaries);
  const maker = overrides.maker ?? faker.helpers.arrayElement(makers);
  const checker = faker.helpers.arrayElement(checkers);
  const status = overrides.status ?? pickStatus();
  const createdAt = overrides.createdAt ?? faker.date.recent({ days: 180 }).toISOString();
  const amount = roundTo(faker.number.float({ min: 50, max: 250000 }), currency.minorUnits);
  const { audit, rowVersion, updatedAt } = buildAudit(status, createdAt, maker, checker);
  const id = overrides.id ?? `pmt-${String(index).padStart(6, '0')}`;

  return {
    id,
    reference: `PAY-${createdAt.slice(0, 4)}-${String(index).padStart(6, '0')}`,
    type,
    status,
    makerUserId: maker.userId,
    makerName: maker.displayName,
    debtorAccount: {
      id: debtorAccount.id,
      masked: debtorAccount.masked,
      full: debtorAccount.iban,
      currency: debtorAccount.currency,
    },
    beneficiary: {
      id: beneficiary.id,
      name: beneficiary.name,
      account: beneficiary.account,
      ...(type === 'INTERNATIONAL'
        ? { swift: beneficiary.swift, country: beneficiary.country, address: beneficiary.address }
        : { bankCode: beneficiary.bankCode }),
    },
    currency: currency.code,
    amount,
    executionDate: overrides.executionDate ?? faker.date.soon({ days: 10, refDate: createdAt }).toISOString().slice(0, 10),
    purposeCode: faker.helpers.arrayElement(PURPOSE_CODES),
    remittanceInformation: overrides.remittanceInformation ?? faker.finance.transactionDescription(),
    ...(type === 'INTERNATIONAL' ? { chargeOption: faker.helpers.arrayElement(CHARGE_OPTIONS) } : {}),
    rowVersion,
    createdAt,
    updatedAt,
    audit,
  };
}

const TOTAL_PAYMENTS = 20000;
const payments = [];

for (let i = 1; i <= TOTAL_PAYMENTS - 5; i += 1) {
  payments.push(buildPayment(i));
}

// Fixed, deterministic scenarios used for manual QA and automated e2e checks.
payments.push(
  buildPayment(19996, {
    id: 'pmt-scn-checker-owns',
    status: 'PENDING_CHECK',
    type: 'DOMESTIC',
    maker: checkers[0],
    createdAt: faker.date.recent({ days: 3 }).toISOString(),
  }),
);
payments.push(
  buildPayment(19997, {
    id: 'pmt-scn-draft',
    status: 'DRAFT',
    type: 'DOMESTIC',
    maker: makers[0],
    createdAt: faker.date.recent({ days: 1 }).toISOString(),
  }),
);
payments.push(
  buildPayment(19998, {
    id: 'pmt-scn-international',
    status: 'PENDING_CHECK',
    type: 'INTERNATIONAL',
    maker: makers[0],
    createdAt: faker.date.recent({ days: 2 }).toISOString(),
  }),
);
payments.push(
  buildPayment(19999, {
    id: 'pmt-scn-returned',
    status: 'RETURNED',
    type: 'DOMESTIC',
    maker: makers[0],
    createdAt: faker.date.recent({ days: 4 }).toISOString(),
  }),
);
payments.push(
  buildPayment(20000, {
    id: 'pmt-scn-trigger-500',
    status: 'DRAFT',
    type: 'DOMESTIC',
    maker: makers[0],
    createdAt: faker.date.recent({ days: 1 }).toISOString(),
    remittanceInformation: 'TRIGGER_500',
  }),
);

const db = {
  users,
  accounts,
  beneficiaries,
  referenceData: {
    currencies: CURRENCIES,
    paymentTypes: ['DOMESTIC', 'INTERNATIONAL'],
    purposeCodes: PURPOSE_CODES,
    chargeOptions: CHARGE_OPTIONS,
  },
  payments,
};

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`Seeded ${payments.length} payments, ${accounts.length} accounts, ${beneficiaries.length} beneficiaries into db.json`);
