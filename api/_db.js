const { Pool } = require("pg");

let pool;

function parseSslModeFromUrl(url) {
  try {
    const u = new URL(url);
    return (u.searchParams.get("sslmode") || "").toLowerCase();
  } catch {
    // If URL parsing fails, fall back to env.
    return "";
  }
}

function buildSslConfig(connectionString) {
  // Neon requires TLS. If user explicitly disables SSL, respect it.
  const sslmodeEnv = (process.env.PGSSLMODE || "").toLowerCase();
  const sslmodeUrl = parseSslModeFromUrl(connectionString);
  const sslmode = sslmodeUrl || sslmodeEnv || (process.env.NODE_ENV === "production" ? "require" : "");

  if (sslmode === "disable") return undefined;

  // `require` = encrypted but don't necessarily verify; `verify-full` = strict verify.
  const strict = sslmode === "verify-full";
  return { rejectUnauthorized: strict };
}

function buildDatabaseUrlFromPgEnv() {
  const host = process.env.PGHOST;
  const db = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const pass = process.env.PGPASSWORD;
  if (!host || !db || !user || !pass) return null;

  // Use verify-full to match current secure behavior and avoid upcoming libpq-compat semantic changes.
  let sslmode = process.env.PGSSLMODE || "verify-full";
  // Keep "require" as-is here; we translate it into a safe `ssl` config in buildSslConfig().
  const channelBinding = process.env.PGCHANNELBINDING;

  const params = new URLSearchParams();
  if (sslmode) params.set("sslmode", sslmode);
  if (channelBinding) params.set("channel_binding", channelBinding);

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${db}?${params.toString()}`;
}

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL || buildDatabaseUrlFromPgEnv();
    if (!url) throw new Error("Missing DATABASE_URL (or PGHOST/PGDATABASE/PGUSER/PGPASSWORD)");
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Neon requires SSL; also makes prod deployments resilient even if DATABASE_URL omits sslmode.
      ssl: buildSslConfig(url),
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  return await p.query(text, params);
}

module.exports = { getPool, query };

