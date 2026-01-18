const { z } = require("zod");
const { json, methodNotAllowed, noStore } = require("../../_http");
const { requireAdmin } = require("../../_auth");
const { query } = require("../../_db");
const { rateLimit } = require("../../_rate_limit");
const { setSecurityHeaders } = require("../../_security");

const limiter = rateLimit({ windowMs: 60_000, max: 20 });

const BodySchema = z.object({
  text: z.string().min(1).max(2_000_000),
});

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const m = digits.match(/\d{8}/);
  return m ? m[0] : "";
}

function parseAmount(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, "");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function guessDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const counts = [
    ["\t", (sample.match(/\t/g) || []).length],
    [",", (sample.match(/,/g) || []).length],
    [";", (sample.match(/;/g) || []).length],
    ["|", (sample.match(/\|/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : "\t";
}

function splitLine(line, delim) {
  if (delim !== "," || line.indexOf('"') === -1) return line.split(delim);

  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (!inQ && ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseRows(text) {
  const trimmed = (text || "").replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  const delim = guessDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => splitLine(line, delim).map((c) => String(c || "").trim()));
}

function extractLotteryId(rawText) {
  const t = String(rawText || "").toUpperCase();
  const known = ["L200", "HILUX", "P30", "LAND200", "LC200", "PRIUS30"];
  for (const id of known) {
    if (!t.includes(id)) continue;
    if (id === "LAND200" || id === "LC200") return "L200";
    if (id === "PRIUS30") return "P30";
    return id;
  }
  const m = t.match(/\b[A-Z]{1,8}\d{1,4}\b/);
  return m ? m[0] : null;
}

function extractTxId(cells) {
  for (let i = cells.length - 1; i >= 0; i--) {
    const d = String(cells[i] || "").replace(/\D/g, "");
    if (d.length >= 9) return d;
  }
  return null;
}

function extractDateTime(cells) {
  for (const c of cells) {
    if (/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(c)) return c;
    if (/\d{4}-\d{2}-\d{2}/.test(c)) return c;
  }
  return null;
}

function toTimestamp(val) {
  if (!val) return null;
  // accept "YYYY-MM-DD HH:mm:ss" and "YYYY-MM-DD"
  const s = String(val).trim();
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function rowToTx(cells) {
  const joined = cells.join(" ");
  const phone = normalizePhone(joined) || null;
  const occurredAt = toTimestamp(extractDateTime(cells));
  const txId = extractTxId(cells);

  let amount = null;
  for (const c of cells) {
    const a = parseAmount(c);
    if (a === null) continue;
    if (a < 10) continue;
    amount = a;
    if (String(c).includes(".") || a >= 1000) break;
  }

  // prefer a cell with letters for description
  let desc = "";
  for (const c of cells) {
    if (!c) continue;
    const hasLetters = /[^\d\s.,:+-]/.test(c);
    if (hasLetters && c.length > desc.length) desc = c;
  }
  if (!desc) {
    for (const c of cells) if (c.length > desc.length) desc = c;
  }

  const lotteryId = extractLotteryId(joined);
  return { txId, occurredAt, amount, phone, lotteryId, desc, raw: cells };
}

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

      const rows = parseRows(parsed.data.text).map(rowToTx);
      let inserted = 0;
      let skipped = 0;

      for (const r of rows) {
        // Skip rows without a phone and without a tx id and without amount
        if (!r.phone && !r.txId && r.amount === null) {
          skipped++;
          continue;
        }

        // Upsert by tx_id when present; else insert (may duplicate)
        if (r.txId) {
          const q = await query(
            `insert into transactions (tx_id, occurred_at, amount, phone, description, lottery_id, raw)
             values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (tx_id) do update set
               occurred_at = coalesce(excluded.occurred_at, transactions.occurred_at),
               amount = coalesce(excluded.amount, transactions.amount),
               phone = coalesce(excluded.phone, transactions.phone),
               description = coalesce(excluded.description, transactions.description),
               lottery_id = coalesce(excluded.lottery_id, transactions.lottery_id),
               raw = excluded.raw,
               imported_at = now()
             returning 1`,
            [r.txId, r.occurredAt, r.amount, r.phone, r.desc, r.lotteryId, JSON.stringify(r.raw)]
          );
          if (q.rowCount > 0) inserted++;
          continue;
        }

        await query(
          `insert into transactions (tx_id, occurred_at, amount, phone, description, lottery_id, raw)
           values (null,$1,$2,$3,$4,$5,$6)`,
          [r.occurredAt, r.amount, r.phone, r.desc, r.lotteryId, JSON.stringify(r.raw)]
        );
        inserted++;
      }

      return json(res, 200, { ok: true, inserted, skipped, total: rows.length });
    } catch {
      return json(res, 500, { error: "server_error" });
    }
  });
};

