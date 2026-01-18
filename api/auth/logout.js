const { json, methodNotAllowed, noStore } = require("../_http");
const { clearSessionCookie } = require("../_auth");
const { setSecurityHeaders } = require("../_security");

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
};

