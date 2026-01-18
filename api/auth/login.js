const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { query } = require("../_db");
const { json, methodNotAllowed, noStore } = require("../_http");
const { rateLimit } = require("../_rate_limit");
const { signSession, setSessionCookie } = require("../_auth");
const { setSecurityHeaders } = require("../_security");

const limiter = rateLimit({ windowMs: 60_000, max: 15 });

const BodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!limiter(req)) return json(res, 429, { error: "rate_limited" });

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const parsed = BodySchema.safeParse(JSON.parse(body || "{}"));
      if (!parsed.success) return json(res, 400, { error: "invalid_body" });

      const { username, password } = parsed.data;
      const r = await query("select id, username, password_hash from admins where username = $1 limit 1", [username]);
      if (r.rows.length === 0) return json(res, 401, { error: "invalid_credentials" });

      const admin = r.rows[0];
      const ok = await bcrypt.compare(password, admin.password_hash);
      if (!ok) return json(res, 401, { error: "invalid_credentials" });

      const token = signSession({ role: "admin", adminId: admin.id, username: admin.username }, { maxAgeSeconds: 60 * 60 * 12 });
      setSessionCookie(res, token, { maxAgeSeconds: 60 * 60 * 12 });

      return json(res, 200, { ok: true, role: "admin", username: admin.username });
    } catch (e) {
      const isProd = process.env.NODE_ENV === "production";
      if (!isProd) console.error("login error:", e);
      return json(res, 500, { error: "server_error", ...(isProd ? {} : { detail: String(e?.message || e) }) });
    }
  });
};

