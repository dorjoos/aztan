const { json, methodNotAllowed, noStore } = require("./_http");
const { query } = require("./_db");
const { setSecurityHeaders } = require("./_security");

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const r = await query(
      "select id, name, fee, bank_account, iban, bank_holder, status, joined, total from lotteries order by sort_order asc nulls last, created_at asc",
      []
    );
    return json(res, 200, { ok: true, lotteries: r.rows });
  } catch (e) {
    const isProd = process.env.NODE_ENV === "production";
    const id = `lot_${Date.now().toString(36)}`;
    console.error("lotteries error", { id, message: e?.message, stack: e?.stack });
    return json(res, 500, {
      error: "server_error",
      id,
      ...(isProd ? {} : { detail: String(e?.message || e) }),
    });
  }
};

