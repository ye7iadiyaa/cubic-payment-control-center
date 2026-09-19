// Short-lived cache of clientRequestId -> response, so a resent request
// (double-click, retry after a flaky connection) replays the original
// response instead of creating a second draft/decision/etc.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

function getCached(clientRequestId) {
  if (!clientRequestId) return null;
  const entry = cache.get(clientRequestId);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(clientRequestId);
    return null;
  }
  return entry;
}

function cacheResult(clientRequestId, result) {
  if (!clientRequestId) return;
  cache.set(clientRequestId, { ...result, at: Date.now() });
}

module.exports = { getCached, cacheResult };
