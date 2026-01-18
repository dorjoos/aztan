const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

// Load local env for convenience (optional)
loadDotEnv(path.join(__dirname, "..", ".env"));

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

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL || buildDatabaseUrlFromPgEnv();
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL (or PGHOST/PGDATABASE/PGUSER/PGPASSWORD)");

  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "change-me";

  const client = new Client({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes("sslmode=") ? { rejectUnauthorized: true } : undefined });
  await client.connect();

  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  await client.query(schemaSql);

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await client.query(
    `insert into admins (username, password_hash)
     values ($1,$2)
     on conflict (username) do update set password_hash = excluded.password_hash`,
    [adminUsername, passwordHash]
  );

  await client.query(
    `insert into lotteries (id, name, fee, bank_account, iban, bank_holder, status, joined, total, sort_order)
     values
      ('L200','Land Cruiser 200',50000,'5439393961','79000500','Х.БУМБАЯР','open',150,1000,1),
      ('HILUX','Toyota Hilux',50000,'5439393961','79000500','Х.БУМБАЯР','open',85,500,2),
      ('P30','Prius 30 Сугалаа',50000,'5439393961','79000500','Х.БУМБАЯР','open',220,800,3)
     on conflict (id) do update set
      name = excluded.name,
      fee = excluded.fee,
      bank_account = excluded.bank_account,
      iban = excluded.iban,
      bank_holder = excluded.bank_holder,
      status = excluded.status,
      joined = excluded.joined,
      total = excluded.total,
      sort_order = excluded.sort_order`
  );

  // demo transactions (matches your screenshot style)
  await client.query(
    `insert into transactions (tx_id, occurred_at, amount, phone, description, lottery_id, raw)
     values
      ('5890791', '2026-01-12T23:26:56Z', 50000.00, '86382266', '99112233 L200', 'L200', '[]'::jsonb),
      ('5890767', '2026-01-12T23:29:14Z', 50000.00, '95975944', '99112233 HILUX', 'HILUX', '[]'::jsonb),
      ('2205246300', '2026-01-12T23:59:21Z', 100000.00, '95140934', '150000 МЯГМАРДОРЖ ДОЛЖИНЖАВ', null, '[]'::jsonb)
     on conflict (tx_id) do nothing`
  );

  await client.end();
  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

