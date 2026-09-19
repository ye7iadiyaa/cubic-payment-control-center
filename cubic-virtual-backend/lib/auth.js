const { db } = require('./db');

function findUser(userId) {
  return db.get('users').find({ userId }).value();
}

// Auth is simulated with an X-Demo-User header carrying the chosen demo
// user's id (there is no real login endpoint - see README).
function currentUser(req) {
  const id = req.headers['x-demo-user'];
  if (!id) return null;
  return findUser(id) || null;
}

function sendError(res, status, code, message, extra = {}) {
  res.status(status).json({ code, message, ...extra });
}

function requireAuth(req, res) {
  const user = currentUser(req);
  if (!user) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Session is not valid.');
    return null;
  }
  return user;
}

function requireRole(req, res, user, roles) {
  if (!roles.includes(user.role)) {
    sendError(res, 403, 'FORBIDDEN', 'You are not entitled to perform this action.');
    return false;
  }
  return true;
}

module.exports = { findUser, currentUser, sendError, requireAuth, requireRole };
