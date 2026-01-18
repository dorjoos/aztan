const { z } = require("zod");
const { json, methodNotAllowed, noStore } = require("../../_http");
const { requireAdmin } = require("../../_auth");
const { query } = require("../../_db");
const { setSecurityHeaders } = require("../../_security");
const { rateLimit } = require("../../_rate_limit");

const limiter = rateLimit({ windowMs: 60_000, max: 60 });

const BodySchema = z.object({
  id: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(120),
  fee: z.number().int().min(0).max(10_000_000),
  status: z.string().min(1).max(20),
  joined: z.number().int().min(0).max(10_000_000),
  total: z.number().int().min(0).max(10_000_000),
  sort_order: z.number().int().min(0).max(10_000_000).optional().nullable(),
  bank_account: z.string().max(64).optional().nullable(),
  iban: z.string().max(64).optional().nullable(),
  bank_holder: z.string().max(64).optional().nullable(),
});

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!limiter(req)) return json(res, 429, { error: "rate_limited" });
  const admin = requireAdmin(req);
  if (!admin) return json(res, 401, { error: "unauthorized" });

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const parsed = BodySchema.safeParse(JSON.parse(body || "{}"));
      if (!parsed.success) return json(res, 400, { error: "invalid_body" });
      const d = parsed.data;
      const r = await query(
        `update lotteries set
          name=$2,
          fee=$3,
          bank_account=$4,
          iban=$5,
          bank_holder=$6,
          status=$7,
          joined=$8,
          total=$9,
          sort_order=$10
         where id=$1`,
        [
          d.id,
          d.name,
          d.fee,
          d.bank_account || null,
          d.iban || null,
          d.bank_holder || null,
          d.status,
          d.joined,
          d.total,
          d.sort_order ?? null,
        ]
      );
      if (r.rowCount === 0) return json(res, 404, { error: "not_found" });
      return json(res, 200, { ok: true });
    } catch (e) {
      const isProd = process.env.NODE_ENV === "production";
      if (!isProd) console.error("admin lotteries update error:", e);
      return json(res, 500, { error: "server_error" });
    }
  });
};

