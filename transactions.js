function qs(sel) {
  return document.querySelector(sel);
}

function normalizePhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  // 8-digit MN numbers in your UI examples
  const m = digits.match(/\d{8}/);
  return m ? m[0] : "";
}

function parseAmount(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  // Accept formats like 50,000.00 / 50000 / 50 000 / 50000.00
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
  // Minimal CSV support: split by delimiter; if comma and has quotes, do a simple quoted parse.
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

function rowToTx(cells) {
  const joined = cells.join(" ");
  const phone = normalizePhone(joined);

  const txId = extractTxId(cells);

  // heuristics: amount is commonly in its own column; pick the best numeric cell
  let amount = null;
  for (const c of cells) {
    const a = parseAmount(c);
    if (a === null) continue;
    // ignore small integers like row numbers
    if (a < 10) continue;
    amount = a;
    // prefer decimal-ish values like 50000.00 by stopping when it has . or is large enough
    if (String(c).includes(".") || a >= 1000) break;
  }

  // date/time guess: look for ISO-ish date
  let date = "";
  for (const c of cells) {
    if (/\d{4}-\d{2}-\d{2}/.test(c) || /\d{2}\.\d{2}\.\d{4}/.test(c) || /\d{2}\/\d{2}\/\d{4}/.test(c)) {
      date = c;
      break;
    }
  }

  // description: keep the longest cell
  let desc = "";
  for (const c of cells) {
    if (c.length > desc.length) desc = c;
  }

  const lotteryId = extractLotteryId(joined);
  // Requirement: transfer value is only phone number (code column mirrors that)
  const code = phone || "";

  return { id: txId, phone, amount, date, desc, lotteryId, code, raw: cells };
}

function extractTxId(cells) {
  for (let i = cells.length - 1; i >= 0; i--) {
    const d = String(cells[i] || "").replace(/\D/g, "");
    if (d.length >= 9) return d;
  }
  return "";
}

function extractLotteryId(rawText) {
  const t = String(rawText || "").toUpperCase();
  const known = ["L200", "HILUX", "P30"];
  for (const id of known) {
    if (t.includes(id)) return id;
  }
  const m = t.match(/\b[A-Z]{1,5}\d{1,4}\b/);
  return m ? m[0] : "";
}

function formatAmount(n) {
  if (n === null || n === undefined) return "";
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getFee() {
  const raw = qs("#feeInput")?.value || "";
  const n = parseAmount(raw);
  return n && n > 0 ? n : null;
}

function classify(tx) {
  const fee = getFee();
  if (!tx.phone) return { status: "Unmatched", cls: "badge badge--bad" };
  if (fee !== null) {
    if (tx.amount !== null && Math.abs(tx.amount - fee) < 0.0001) return { status: "Matched", cls: "badge badge--ok" };
    return { status: "Wrong amount", cls: "badge badge--warn" };
  }
  // if no fee filter, phone is enough
  return { status: "Matched", cls: "badge badge--ok" };
}

function renderTable(rows) {
  const body = qs("#txBody");
  if (!body) return;
  body.innerHTML = "";

  const onlyMatched = qs("#onlyMatched")?.value === "on";
  const dedupe = qs("#dedupeSelect")?.value || "off";

  let out = rows.slice();

  // Dedupe by phone
  if (dedupe === "latest") {
    const map = new Map();
    for (const r of out) {
      if (!r.phone) continue;
      map.set(r.phone, r);
    }
    const keptPhones = new Set(map.keys());
    out = out.filter((r) => !r.phone || keptPhones.has(r.phone));
    out = Array.from(map.values()).concat(out.filter((r) => !r.phone));
  }

  let matched = 0;
  const phoneSet = new Set();

  out.forEach((tx) => {
    const c = classify(tx);
    if (tx.phone) phoneSet.add(tx.phone);
    if (c.status === "Matched") matched++;
    if (onlyMatched && c.status !== "Matched") return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="${c.cls}">${c.status}</span></td>
      <td><b>${tx.id || ""}</b></td>
      <td><b>${tx.phone || ""}</b></td>
      <td>${tx.code || ""}</td>
      <td>${formatAmount(tx.amount)}</td>
      <td>${tx.date || ""}</td>
      <td class="desc">${escapeHtml(tx.desc || "")}</td>
    `;
    body.append(tr);
  });

  qs("#rowsCount").textContent = String(rows.length);
  qs("#matchedCount").textContent = String(matched);
  qs("#phonesCount").textContent = String(phoneSet.size);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let lastRows = [];

async function readSelectedFile() {
  const file = qs("#fileInput")?.files?.[0];
  if (!file) return "";
  return await file.text();
}

async function parseAndRender() {
  const pasted = qs("#pasteBox")?.value || "";
  const fileText = await readSelectedFile();
  const src = pasted.trim().length ? pasted : fileText;
  const cellsRows = parseRows(src);
  lastRows = cellsRows.map(rowToTx);
  renderTable(lastRows);
}

async function importToDb() {
  const pasted = qs("#pasteBox")?.value || "";
  const fileText = await readSelectedFile();
  const src = pasted.trim().length ? pasted : fileText;
  if (!src.trim()) return;

  const r = await fetch("/api/admin/transactions/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: src }),
  });
  const j = await r.json().catch(() => ({}));
  const msg = qs("#importMsg");
  if (msg) {
    msg.textContent = r.ok ? `Импорт OK. inserted=${j.inserted ?? "?"}, skipped=${j.skipped ?? "?"}` : `Импорт алдаа: ${j.error || r.status}`;
  }
}

function clearAll() {
  const fileInput = qs("#fileInput");
  if (fileInput) fileInput.value = "";
  const paste = qs("#pasteBox");
  if (paste) paste.value = "";
  lastRows = [];
  renderTable(lastRows);
}

function wire() {
  qs("#parseBtn")?.addEventListener("click", parseAndRender);
  qs("#importBtn")?.addEventListener("click", importToDb);
  qs("#clearBtn")?.addEventListener("click", clearAll);
  qs("#feeInput")?.addEventListener("input", () => renderTable(lastRows));
  qs("#dedupeSelect")?.addEventListener("change", () => renderTable(lastRows));
  qs("#onlyMatched")?.addEventListener("change", () => renderTable(lastRows));
  qs("#fileInput")?.addEventListener("change", () => {
    // auto parse when file chosen (if paste box is empty)
    const pasted = qs("#pasteBox")?.value || "";
    if (!pasted.trim()) parseAndRender();
  });
}

wire();
renderTable([]);

