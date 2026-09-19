const multer = require('multer');
const jsonServer = require('json-server');

const { db } = require('./lib/db');
const { requireAuth, sendError } = require('./lib/auth');
const payments = require('./lib/payments');
const { createQuote } = require('./lib/fx');
const { handleBulkUpload } = require('./lib/bulk');

const server = jsonServer.create();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

server.use(jsonServer.defaults());
server.use(jsonServer.bodyParser);

// Login-screen convenience only - not part of the documented API contract.
server.get('/api/demo-users', (req, res) => {
  res.json(db.get('users').map((u) => ({ userId: u.userId, displayName: u.displayName, role: u.role })).value());
});

server.get('/api/me', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json(user);
});

server.get('/api/accounts', (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json({ items: db.get('accounts').value() });
});

server.get('/api/beneficiaries', (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json({ items: db.get('beneficiaries').value() });
});

server.get('/api/reference-data', (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(db.get('referenceData').value());
});

server.get('/api/payments', payments.list);
server.get('/api/payments/:id', payments.getOne);
server.post('/api/payments', payments.create);
server.put('/api/payments/:id', payments.update);
server.post('/api/payments/:id/submit', payments.submit);
server.post('/api/payments/:id/cancel', payments.cancel);
server.post('/api/payments/:id/decision', payments.decide);

server.post('/api/fx/quote', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { debitAccountId, sourceCurrency, targetCurrency, targetAmount } = req.body;
  if (!debitAccountId || !sourceCurrency || !targetCurrency || typeof targetAmount !== 'number') {
    return sendError(res, 422, 'VALIDATION_ERROR', 'debitAccountId, sourceCurrency, targetCurrency and targetAmount are required.');
  }
  res.json(createQuote({ debitAccountId, sourceCurrency, targetCurrency, targetAmount }));
});

server.post('/api/bulk-payments', upload.single('file'), handleBulkUpload);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mock banking API listening on http://localhost:${PORT}`);
});
