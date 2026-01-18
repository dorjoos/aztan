const { z } = require("zod");
const { json, methodNotAllowed, noStore } = require("../../_http");
const { requireAdmin } = require("../../_auth");
const { query } = require("../../_db");
const { setSecurityHeaders } = require("../../_security");
const { rateLimit } = require("../../_rate_limit");

const limiter = rateLimit({ windowMs: 60_000, max: 30 });

const BodySchema = z.object({
  id: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
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

      const r = await query("delete from lotteries where id = $1", [parsed.data.id]);
      if (r.rowCount === 0) return json(res, 404, { error: "not_found" });
      return json(res, 200, { ok: true });
    } catch (e) {
      const isProd = process.env.NODE_ENV === "production";
      if (!isProd) console.error("admin lotteries delete error:", e);
      return json(res, 500, { error: "server_error" });
    }
  });
};

