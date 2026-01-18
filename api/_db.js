const { Pool } = require("pg");

let pool;

function buildDatabaseUrlFromPgEnv() {
  const host = process.env.PGHOST;
  const db = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const pass = process.env.PGPASSWORD;
  if (!host || !db || !user || !pass) return null;

  // Use verify-full to match current secure behavior and avoid upcoming libpq-compat semantic changes.
  let sslmode = process.env.PGSSLMODE || "verify-full";
  if (sslmode === "require") sslmode = "verify-full";
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
      // Prefer strict TLS verification for Neon.
      ssl: url.includes("sslmode=") ? { rejectUnauthorized: true } : undefined,
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  return await p.query(text, params);
}

module.exports = { getPool, query };

