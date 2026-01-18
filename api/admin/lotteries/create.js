const { z } = require("zod");
const { json, methodNotAllowed, noStore } = require("../../_http");
const { requireAdmin } = require("../../_auth");
const { query } = require("../../_db");
const { setSecurityHeaders } = require("../../_security");
const { rateLimit } = require("../../_rate_limit");

const limiter = rateLimit({ windowMs: 60_000, max: 30 });

const BodySchema = z.object({
  id: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(120),
  fee: z.number().int().min(0).max(10_000_000),
  status: z.string().min(1).max(20).default("open"),
  joined: z.number().int().min(0).max(10_000_000).default(0),
  total: z.number().int().min(0).max(10_000_000).default(0),
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
      await query(
        `insert into lotteries (id, name, fee, bank_account, iban, bank_holder, status, joined, total, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
      return json(res, 200, { ok: true });
    } catch (e) {
      const isProd = process.env.NODE_ENV === "production";
      if (!isProd) console.error("admin lotteries create error:", e);
      return json(res, 500, { error: "server_error" });
    }
  });
};

