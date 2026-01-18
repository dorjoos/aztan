function qs(sel) {
  return document.querySelector(sel);
}

function formatAmount(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  const fixed = Number.isInteger(num) ? String(num) : num.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function setMsg(text) {
  const el = qs("#recentTxMsg");
  if (el) el.textContent = text || "";
}

function clearBody() {
  const body = qs("#recentTxBody");
  if (body) body.innerHTML = "";
}

function appendRow(cells) {
  const body = qs("#recentTxBody");
  if (!body) return;
  const tr = document.createElement("tr");
  cells.forEach((c, idx) => {
    const td = document.createElement("td");
    if (idx === 0 || idx === 3) {
      const b = document.createElement("b");
      b.textContent = c || "";
      td.append(b);
    } else {
      td.textContent = c || "";
    }
    if (idx === 5) td.className = "desc";
    tr.append(td);
  });
  body.append(tr);
}

async function loadRecent() {
  // If the table isn't on this page, do nothing
  if (!qs("#recentTxBody")) return;

  setMsg("Уншиж байна...");
  clearBody();
  try {
    const r = await fetch("/api/transactions/recent?limit=20");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(`Алдаа: ${j.error || `http_${r.status}`}`);
      return;
    }
    const rows = Array.isArray(j.rows) ? j.rows : [];
    if (rows.length === 0) {
      setMsg("Одоогоор гүйлгээ олдсонгүй.");
      return;
    }
    setMsg("");
    rows.forEach((row) => {
      appendRow([
        row.id || "",
        row.date || "",
        formatAmount(row.amount),
        row.phoneMasked || "",
        row.lotteryId || "",
        row.desc || "",
      ]);
    });
  } catch {
    setMsg("Алдаа: network_error");
  }
}

loadRecent();

