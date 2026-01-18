// Lotteries are loaded from DB via /api/lotteries
function imgForLottery(id) {
  if (id === "L200") return "./assets/car-land200.svg";
  if (id === "HILUX") return "./assets/car-hilux.svg";
  if (id === "P30") return "./assets/car-prius.svg";
  return "./assets/car-land200.svg";
}

const state = {
  phone: "",
  step: "home", // home | pay | thanks
  selected: null,
  tx: {
    phone: "",
    loading: false,
    error: "",
    rows: [],
  },
  lotteries: {
    loading: false,
    error: "",
    rows: [],
  },
};

function qs(sel) {
  return document.querySelector(sel);
}

function normalizePhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.slice(0, 8);
}

function getTransferValue() {
  // Requirement: transfer value is only the phone number
  return normalizePhone(state.phone) || "99112233";
}

let txTimer = null;
let txAbort = null;

function setTxState(next) {
  state.tx = { ...state.tx, ...next };
}

function scheduleFetchTransactions(phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (txTimer) clearTimeout(txTimer);

  if (phone.length !== 8) {
    if (txAbort) txAbort.abort();
    setTxState({ phone: "", loading: false, error: "", rows: [] });
    const mount = qs("#phoneTxMount");
    if (mount) renderPhoneTransactions(mount);
    return;
  }

  txTimer = setTimeout(() => fetchTransactions(phone), 250);
}

async function fetchTransactions(phone) {
  try {
    if (txAbort) txAbort.abort();
    txAbort = new AbortController();

    setTxState({ phone, loading: true, error: "", rows: [] });
    const mount = qs("#phoneTxMount");
    if (mount) renderPhoneTransactions(mount);

    const r = await fetch(`/api/transactions?phone=${encodeURIComponent(phone)}`, { signal: txAbort.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setTxState({ loading: false, error: j.error || `http_${r.status}`, rows: [] });
      if (mount) renderPhoneTransactions(mount);
      return;
    }
    setTxState({ loading: false, error: "", rows: Array.isArray(j.rows) ? j.rows : [] });
    if (mount) renderPhoneTransactions(mount);
  } catch (e) {
    if (e?.name === "AbortError") return;
    setTxState({ loading: false, error: "network_error", rows: [] });
    const mount = qs("#phoneTxMount");
    if (mount) renderPhoneTransactions(mount);
  }
}

function formatAmount(n) {
  if (n === null || n === undefined) return "";
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  for (const child of children) node.append(child);
  return node;
}

function renderPhoneTransactions(mountEl) {
  mountEl.innerHTML = "";

  const phone = normalizePhone(state.phone);
  const mine =
    phone && state.tx.phone === phone
      ? (state.tx.rows || []).filter((r) => (r.phone || "") === phone).slice(0, 8)
      : [];

  const box = el("div", { class: "tx-mini" }, [el("div", { class: "tx-mini__title" }, ["Таны гүйлгээ"]) ]);

  if (!phone) {
    box.append(el("div", { class: "code-note" }, ["Утасны дугаараа оруулмагц тухайн дугаарын гүйлгээ энд гарна."]));
    mountEl.append(box);
    return;
  }

  if (state.tx.loading && state.tx.phone === phone) {
    box.append(el("div", { class: "code-note" }, ["Гүйлгээ уншиж байна..."]));
    mountEl.append(box);
    return;
  }

  if (state.tx.error && state.tx.phone === phone) {
    box.append(el("div", { class: "code-note" }, [`Алдаа: ${state.tx.error}`]));
    mountEl.append(box);
    return;
  }

  if (mine.length === 0) {
    box.append(el("div", { class: "code-note" }, ["Одоогоор энэ дугаарт тохирох гүйлгээ олдсонгүй."]));
    mountEl.append(box);
    return;
  }

  const table = el("table", { class: "table" }, [
    el("thead", {}, [
      el("tr", {}, [el("th", {}, ["ID"]), el("th", {}, ["Огноо"]), el("th", {}, ["Дүн"]), el("th", {}, ["Гүйлгээний утга"])])
    ]),
    el(
      "tbody",
      {},
      mine.map((r) =>
        el("tr", {}, [
          el("td", {}, [el("b", {}, [r.id || ""])]),
          el("td", {}, [r.date || ""]),
          el("td", {}, [formatAmount(r.amount)]),
          el("td", { class: "desc" }, [r.desc || ""]),
        ])
      )
    ),
  ]);

  box.append(el("div", { class: "table-wrap" }, [table]));
  mountEl.append(box);
}

function renderLotteries() {
  const root = qs("#lotteryGrid");
  if (!root) return;
  root.innerHTML = "";

  if (state.lotteries.loading) {
    root.append(el("div", { class: "muted" }, ["Сугалаанууд уншиж байна..."]));
    return;
  }
  if (state.lotteries.error) {
    root.append(el("div", { class: "muted" }, [`Алдаа: ${state.lotteries.error}`]));
    return;
  }

  const rows = state.lotteries.rows || [];
  rows.forEach((l) => {
    const card = el("div", { class: "lottery-card" }, [
      el("img", { class: "lottery-card__img", src: imgForLottery(l.id), alt: l.name }),
      el("div", { class: "lottery-card__body" }, [
        el("div", { class: "lottery-card__name" }, [l.name]),
        el("div", { class: "lottery-card__meta" }, [`${l.joined}/${l.total} оролцсон`]),
        el(
          "button",
          {
            class: "btn btn--primary btn--sm",
            onclick: () => {
              state.selected = l;
              state.step = "home";
              renderPanel();
              const panel = qs("#rightPanel");
              if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          ["Сонгох"]
        ),
      ]),
    ]);
    root.append(card);
  });
}

async function loadLotteries() {
  try {
    state.lotteries.loading = true;
    state.lotteries.error = "";
    renderLotteries();

    const r = await fetch("/api/lotteries");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      state.lotteries.loading = false;
      state.lotteries.error = j.error || `http_${r.status}`;
      renderLotteries();
      return;
    }

    state.lotteries.loading = false;
    state.lotteries.rows = Array.isArray(j.lotteries) ? j.lotteries : [];
    state.lotteries.error = "";

    if (!state.selected && state.lotteries.rows.length > 0) {
      state.selected = state.lotteries.rows[0];
    }
    renderLotteries();
    renderPanel();
  } catch {
    state.lotteries.loading = false;
    state.lotteries.error = "network_error";
    renderLotteries();
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderRecentTransactions(rows) {
  const body = qs("#recentTxBody");
  const msg = qs("#recentTxMsg");
  if (!body) return;
  body.innerHTML = "";

  if (!rows || rows.length === 0) {
    if (msg) msg.textContent = "Одоогоор гүйлгээ олдсонгүй.";
    return;
  }
  if (msg) msg.textContent = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(r.id || "")}</b></td>
      <td>${escapeHtml(r.date || "")}</td>
      <td>${escapeHtml(formatAmount(r.amount))}</td>
      <td><b>${escapeHtml(r.phoneMasked || "")}</b></td>
      <td>${escapeHtml(r.lotteryId || "")}</td>
      <td class="desc">${escapeHtml(r.desc || "")}</td>
    `;
    body.append(tr);
  });
}

async function loadRecentTransactions() {
  const msg = qs("#recentTxMsg");
  if (msg) msg.textContent = "Уншиж байна...";
  try {
    const r = await fetch("/api/transactions/recent?limit=20");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (msg) msg.textContent = `Алдаа: ${j.error || `http_${r.status}`}`;
      renderRecentTransactions([]);
      return;
    }
    renderRecentTransactions(Array.isArray(j.rows) ? j.rows : []);
  } catch {
    if (msg) msg.textContent = "Алдаа: network_error";
    renderRecentTransactions([]);
  }
}

function renderPanel() {
  const title = qs("#panelTitle");
  const root = qs("#panelContent");
  if (!root || !title) return;
  root.innerHTML = "";

  title.textContent = "Утас";
  const txMount = el("div", { id: "phoneTxMount" }, []);

  const phoneRow = el("div", { class: "inline" }, [
    el("div", { class: "field" }, [
      el("label", { class: "label" }, ["Утасны дугаараа оруулна уу"]),
      el("input", {
        id: "phoneInput",
        class: "input",
        inputmode: "numeric",
        placeholder: "99112233",
        value: state.phone,
        oninput: (e) => {
          state.phone = e.target.value;
          renderPhoneTransactions(txMount);
          scheduleFetchTransactions(state.phone);
        },
      }),
    ]),
  ]);

  root.append(phoneRow, txMount);
  renderPhoneTransactions(txMount);
  scheduleFetchTransactions(state.phone);

  // Payment details should be visible without requiring a separate "Оролцох" click.
  if (state.selected) {
    const l = state.selected;
    title.textContent = `${l.name}`;
    root.append(
      el("div", { class: "stack" }, [
        el("div", { class: "lead" }, [
          "1ш эрх ",
          el("span", { class: "money" }, [`${formatAmount(l.fee)}₮`]),
        ]),
        el("div", { class: "kv" }, [
          el("div", { class: "kv__row" }, [el("span", { class: "kv__k" }, ["Дүн:"]), el("b", {}, [`${formatAmount(l.fee)}₮`])]),
          el("div", { class: "kv__row" }, [el("span", { class: "kv__k" }, ["Данс:"]), el("b", {}, [l.bank_account || "—"])]),
          el("div", { class: "kv__row" }, [el("span", { class: "kv__k" }, ["IBAN:"]), el("b", {}, [l.iban || "—"])]),
          el("div", { class: "kv__row" }, [el("span", { class: "kv__k" }, ["Дансны нэр:"]), el("b", {}, [l.bank_holder || "—"])]),
          el("div", { class: "kv__row" }, [
            el("span", { class: "kv__k" }, ["Гүйлгээний утга:"]),
            "зөвхөн утасны дугаараа бичнэ.",
          ]),
        ]),
        el("img", { class: "car-side", src: imgForLottery(l.id), alt: l.name }),
        el(
          "button",
          {
            class: "btn btn--success",
            onclick: () => {
              state.step = "thanks";
              renderPanel();
            },
          },
          ["Мөнгө шилжүүлсэн"]
        ),
      ])
    );
    return;
  }

  if (state.step === "thanks") {
    root.append(
      el("div", { class: "stack center" }, [
        el("div", { class: "big" }, ["Баярлалаа!"]),
        el("div", { class: "muted" }, ["Таны мэдээллийг шалгаад 15 минутын дотор сугалаанд оруулах болно."]),
        el(
          "button",
          {
            class: "btn btn--primary",
            onclick: () => {
              state.step = "home";
              renderPanel();
            },
          },
          ["Нүүр рүү"]
        ),
      ])
    );
    return;
  }

  root.append(
    el("div", { class: "stack" }, [
      el("div", { class: "code-note" }, ["Сугалаа сонгосны дараа энэ хэсэгт банкны мэдээлэл, төлөх дүн гарна."]),
    ])
  );
}

function setupDrawer() {
  const drawer = qs("#drawer");
  const menuBtn = qs("#menuBtn");
  const closeBtn = qs("#drawerClose");
  const backdrop = qs("#drawerBackdrop");
  if (!drawer || !menuBtn || !closeBtn || !backdrop) return;

  const open = () => {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  };
  const close = () => {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  };

  menuBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

renderLotteries();
renderPanel();
setupDrawer();
loadRecentTransactions();
loadLotteries();