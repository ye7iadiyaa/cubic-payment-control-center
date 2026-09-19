const path = require('path');
const jsonServer = require('json-server');

const DB_PATH = path.join(__dirname, '..', 'db.json');

// We only use json-server for its lowdb-backed store (router.db). The router
// itself is never mounted - every route in this app is hand-written so the
// response shapes and status codes can match the assessment's API contract
// exactly instead of json-server's default REST conventions.
const router = jsonServer.router(DB_PATH);
const db = router.db;

module.exports = { db };
