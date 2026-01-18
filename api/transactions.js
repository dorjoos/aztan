const { z } = require("zod");
const { json, methodNotAllowed, noStore } = require("./_http");
const { query } = require("./_db");
const { rateLimit } = require("./_rate_limit");
const { setSecurityHeaders } = require("./_security");

const limiter = rateLimit({ windowMs: 60_000, max: 60 });

const QuerySchema = z.object({
  phone: z.string().regex(/^\d{8}$/),
});

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!limiter(req)) return json(res, 429, { error: "rate_limited" });

  const parsed = QuerySchema.safeParse(req.query || {});
  if (!parsed.success) return json(res, 400, { error: "invalid_query" });

  try {
    const { phone } = parsed.data;
    const r = await query(
      `select tx_id as id, occurred_at as date, amount, phone, description as desc, lottery_id
       from transactions
       where phone = $1
       order by occurred_at desc nulls last, imported_at desc
       limit 50`,
      [phone]
    );

    const rows = r.rows.map((x) => ({
      id: x.id || "",
      date: x.date ? new Date(x.date).toISOString().replace("T", " ").slice(0, 19) : "",
      amount: x.amount === null ? null : Number(x.amount),
      phone: x.phone,
      lotteryId: x.lottery_id || "",
      code: x.phone || "",
      desc: x.desc || "",
    }));

    return json(res, 200, { ok: true, rows });
  } catch (e) {
    const id = `tx_${Date.now().toString(36)}`;
    console.error("transactions error", { id, message: e?.message, stack: e?.stack });
    return json(res, 500, { error: "server_error", id });
  }
};

