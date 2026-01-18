const { json, methodNotAllowed, noStore } = require("../_http");
const { getSession } = require("../_auth");
const { setSecurityHeaders } = require("../_security");

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const s = getSession(req);
  if (!s) return json(res, 200, { ok: true, authenticated: false });
  return json(res, 200, { ok: true, authenticated: true, role: s.role, username: s.username });
};

