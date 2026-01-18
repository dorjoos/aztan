const { json, methodNotAllowed, noStore } = require("../../_http");
const { requireAdmin } = require("../../_auth");
const { query } = require("../../_db");
const { setSecurityHeaders } = require("../../_security");

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const admin = requireAdmin(req);
  if (!admin) return json(res, 401, { error: "unauthorized" });

  try {
    const r = await query(
      "select id, name, fee, bank_account, iban, bank_holder, status, joined, total, sort_order from lotteries order by sort_order asc nulls last, created_at asc",
      []
    );
    return json(res, 200, { ok: true, lotteries: r.rows });
  } catch (e) {
    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) console.error("admin lotteries list error:", e);
    return json(res, 500, { error: "server_error" });
  }
};

