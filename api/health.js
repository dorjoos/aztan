const { json, methodNotAllowed, noStore } = require("./_http");
const { query } = require("./_db");
const { setSecurityHeaders } = require("./_security");

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    await query("select 1 as ok", []);
    return json(res, 200, { ok: true, db: true });
  } catch (e) {
    const id = `health_${Date.now().toString(36)}`;
    console.error("health error", { id, message: e?.message, stack: e?.stack });
    return json(res, 500, { ok: false, db: false, error: "server_error", id });
  }
};

