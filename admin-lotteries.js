function qs(sel) {
  return document.querySelector(sel);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  for (const c of children) node.append(c);
  return node;
}

function setMsg(text) {
  const m = qs("#lotteryMsg");
  if (m) m.textContent = text || "";
}

function formatStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "open") return `<span class="tag tag--open">Open</span>`;
  return `<span class="tag">${escapeHtml(status || "")}</span>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function rowTemplate(l) {
  const tr = document.createElement("tr");
  tr.dataset.id = l.id;
  tr.innerHTML = `
    <td>
      <div><b>${escapeHtml(l.name || "")}</b></div>
      <div class="muted">${escapeHtml(l.id || "")} • fee: ${escapeHtml(String(l.fee ?? ""))}</div>
    </td>
    <td>${formatStatus(l.status)}</td>
    <td>${escapeHtml(String(l.joined ?? 0))}/${escapeHtml(String(l.total ?? 0))}</td>
    <td class="actions">
      <button class="btn btn--primary btn--xs" data-action="edit">Edit</button>
      <button class="btn btn--danger btn--xs" data-action="delete">Delete</button>
    </td>
  `;
  return tr;
}

function editorTemplate(l) {
  const tr = document.createElement("tr");
  tr.dataset.id = l.id;
  tr.innerHTML = `
    <td colspan="4">
      <div class="stack">
        <div class="inline">
          <div class="field">
            <div class="label">ID</div>
            <input class="input" data-k="id" value="${escapeHtml(l.id || "")}" readonly />
          </div>
          <div class="field">
            <div class="label">Нэр</div>
            <input class="input" data-k="name" value="${escapeHtml(l.name || "")}" />
          </div>
          <div class="field">
            <div class="label">Fee</div>
            <input class="input" data-k="fee" inputmode="numeric" value="${escapeHtml(String(l.fee ?? 0))}" />
          </div>
          <div class="field">
            <div class="label">Status</div>
            <select class="input" data-k="status">
              <option value="open" ${String(l.status) === "open" ? "selected" : ""}>open</option>
              <option value="closed" ${String(l.status) === "closed" ? "selected" : ""}>closed</option>
            </select>
          </div>
        </div>
        <div class="inline">
          <div class="field">
            <div class="label">Joined</div>
            <input class="input" data-k="joined" inputmode="numeric" value="${escapeHtml(String(l.joined ?? 0))}" />
          </div>
          <div class="field">
            <div class="label">Total</div>
            <input class="input" data-k="total" inputmode="numeric" value="${escapeHtml(String(l.total ?? 0))}" />
          </div>
          <div class="field">
            <div class="label">Sort order</div>
            <input class="input" data-k="sort_order" inputmode="numeric" value="${escapeHtml(l.sort_order == null ? "" : String(l.sort_order))}" />
          </div>
        </div>
        <div class="inline">
          <div class="field">
            <div class="label">Данс</div>
            <input class="input" data-k="bank_account" value="${escapeHtml(l.bank_account || "")}" />
          </div>
          <div class="field">
            <div class="label">IBAN</div>
            <input class="input" data-k="iban" value="${escapeHtml(l.iban || "")}" />
          </div>
          <div class="field">
            <div class="label">Дансны нэр</div>
            <input class="input" data-k="bank_holder" value="${escapeHtml(l.bank_holder || "")}" />
          </div>
        </div>
        <div class="inline">
          <button class="btn btn--success btn--xs" data-action="save">Save</button>
          <button class="btn btn--ghost btn--xs" data-action="cancel">Cancel</button>
          <div class="code-note" data-role="rowMsg"></div>
        </div>
      </div>
    </td>
  `;
  return tr;
}

async function api(path, body) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `http_${r.status}`);
  return j;
}

let cache = [];

async function refresh() {
  setMsg("Loading...");
  const body = qs("#lotteriesBody");
  if (!body) return;
  body.innerHTML = "";
  try {
    const j = await api("/api/admin/lotteries/list");
    cache = Array.isArray(j.lotteries) ? j.lotteries : [];
    cache.forEach((l) => body.append(rowTemplate(l)));
    setMsg("");
  } catch (e) {
    setMsg(`Алдаа: ${e.message || e}`);
  }
}

function getEditorValues(tr) {
  const get = (k) => tr.querySelector(`[data-k="${k}"]`)?.value ?? "";
  const toInt = (s, fallback = 0) => {
    const n = Number(String(s).trim());
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  };
  const so = String(get("sort_order")).trim();
  return {
    id: String(get("id")).trim(),
    name: String(get("name")).trim(),
    fee: toInt(get("fee"), 0),
    status: String(get("status")).trim() || "open",
    joined: toInt(get("joined"), 0),
    total: toInt(get("total"), 0),
    sort_order: so ? toInt(so, 0) : null,
    bank_account: String(get("bank_account")).trim() || null,
    iban: String(get("iban")).trim() || null,
    bank_holder: String(get("bank_holder")).trim() || null,
  };
}

async function onTableClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const tr = btn.closest("tr");
  if (!tr) return;
  const id = tr.dataset.id;
  const action = btn.dataset.action;
  const body = qs("#lotteriesBody");
  if (!body) return;

  if (action === "edit") {
    const l = cache.find((x) => x.id === id);
    if (!l) return;
    const editor = editorTemplate(l);
    tr.replaceWith(editor);
    return;
  }

  if (action === "cancel") {
    const l = cache.find((x) => x.id === id);
    if (!l) return refresh();
    tr.replaceWith(rowTemplate(l));
    return;
  }

  if (action === "save") {
    const payload = getEditorValues(tr);
    const msg = tr.querySelector('[data-role="rowMsg"]');
    if (msg) msg.textContent = "Saving...";
    try {
      await api("/api/admin/lotteries/update", payload);
      await refresh();
    } catch (err) {
      if (msg) msg.textContent = `Алдаа: ${err.message || err}`;
    }
    return;
  }

  if (action === "delete") {
    if (!confirm(`Delete lottery ${id}?`)) return;
    try {
      await api("/api/admin/lotteries/delete", { id });
      await refresh();
    } catch (err) {
      alert(`Алдаа: ${err.message || err}`);
    }
  }
}

async function createLottery() {
  setMsg("Opening modal...");
  openCreateModal();
}

function openCreateModal() {
  const modal = qs("#createLotteryModal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  setCreateMsg("");
  qs("#newLotteryId")?.focus();
}

function closeCreateModal() {
  const modal = qs("#createLotteryModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  setCreateMsg("");
}

function setCreateMsg(text) {
  const m = qs("#createLotteryModalMsg");
  if (m) m.textContent = text || "";
}

function readNewLotteryForm() {
  const v = (id) => (qs(id)?.value ?? "").trim();
  const n = (s, fb = 0) => {
    const x = Number(String(s).trim());
    return Number.isFinite(x) ? Math.trunc(x) : fb;
  };
  const id = v("#newLotteryId").toUpperCase();
  const sortRaw = v("#newLotterySortOrder");
  return {
    id,
    name: v("#newLotteryName"),
    fee: n(v("#newLotteryFee"), 0),
    status: v("#newLotteryStatus") || "open",
    joined: n(v("#newLotteryJoined"), 0),
    total: n(v("#newLotteryTotal"), 0),
    sort_order: sortRaw ? n(sortRaw, 0) : null,
    bank_account: v("#newLotteryBankAccount") || null,
    iban: v("#newLotteryIban") || null,
    bank_holder: v("#newLotteryBankHolder") || null,
  };
}

async function submitCreateLottery() {
  setCreateMsg("Creating...");
  const data = readNewLotteryForm();
  if (!data.id || !/^[A-Z0-9_]+$/.test(data.id)) {
    setCreateMsg("ID буруу байна (A-Z, 0-9, _).");
    return;
  }
  if (!data.name) {
    setCreateMsg("Нэр заавал.");
    return;
  }
  try {
    await api("/api/admin/lotteries/create", data);
    closeCreateModal();
    await refresh();
  } catch (e) {
    setCreateMsg(`Алдаа: ${e.message || e}`);
  }
}

function wire() {
  const refreshBtn = qs("#refreshLotteriesBtn");
  const createBtn = qs("#createLotteryBtn");
  const body = qs("#lotteriesBody");

  refreshBtn?.addEventListener("click", refresh);
  createBtn?.addEventListener("click", createLottery);
  body?.addEventListener("click", onTableClick);

  if (!createBtn) setMsg("Алдаа: createLotteryBtn not found (refresh page).");

  // modal close handlers
  document.querySelectorAll("[data-modal-close]").forEach((x) => x.addEventListener("click", closeCreateModal));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCreateModal();
  });
  const saveBtn = qs("#createLotterySaveBtn");
  saveBtn?.addEventListener("click", submitCreateLottery);
  if (!saveBtn) console.warn("createLotterySaveBtn not found");
}

function init() {
  wire();
  refresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

