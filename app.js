/* =========================================================================
   Ledger — personal expense tracker
   All data lives in localStorage. Nothing is sent anywhere.
   ========================================================================= */

const STORAGE = {
  TX: 'ledger.transactions.v1',
  RULES: 'ledger.rules.v1',
  CATS: 'ledger.categories.v1',
};

const DEFAULT_CATEGORIES = [
  { name: 'Groceries', color: 'var(--cat-1)' },
  { name: 'Dining', color: 'var(--cat-3)' },
  { name: 'Transport', color: 'var(--cat-4)' },
  { name: 'Housing', color: 'var(--cat-2)' },
  { name: 'Utilities', color: 'var(--cat-7)' },
  { name: 'Shopping', color: 'var(--cat-10)' },
  { name: 'Entertainment', color: 'var(--cat-8)' },
  { name: 'Health', color: 'var(--cat-5)' },
  { name: 'Travel', color: 'var(--cat-6)' },
  { name: 'Subscriptions', color: 'var(--cat-11)' },
  { name: 'Income', color: 'var(--cat-9)' },
  { name: 'Fees', color: 'var(--cat-12)' },
  { name: 'Uncategorized', color: '#8A9A8D' },
];

/* ---------- tiny state helpers ---------- */

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Failed to read', key, e);
    return fallback;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let transactions = load(STORAGE.TX, []);
let rules = load(STORAGE.RULES, []);
let categories = load(STORAGE.CATS, DEFAULT_CATEGORIES);

function persistTx() { save(STORAGE.TX, transactions); }
function persistRules() { save(STORAGE.RULES, rules); }
function persistCats() { save(STORAGE.CATS, categories); }

function categoryColor(name) {
  const c = categories.find(c => c.name === name);
  return c ? c.color : '#8A9A8D';
}

/* ---------- formatting ---------- */

const fmtMoney = n => (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2);
const fmtDate = iso => {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------- categorization ---------- */

function guessVendor(description) {
  let s = description.replace(/\d[\d\-\/\* ]{3,}/g, ' ').trim();
  const words = s.split(/\s+/).filter(Boolean).slice(0, 3);
  const vendor = words.join(' ').trim();
  return vendor || description.slice(0, 20);
}

// Apply all rules to a description. Returns { category, vendor, excluded }.
// Categorize-rules: first match wins. Exclude-rules: any match sets excluded=true.
function applyRules(description) {
  const desc = description.toLowerCase();
  let category = null, vendor = null, excluded = false;
  for (const r of rules) {
    if (!r.match || !desc.includes(r.match.toLowerCase())) continue;
    if (r.type === 'exclude') {
      excluded = true;
    } else if (category === null) {
      category = r.category;
      vendor = r.vendor;
    }
  }
  return { category, vendor, excluded };
}

function categorize(description) {
  const hit = applyRules(description);
  return {
    category: hit.category || 'Uncategorized',
    vendor: hit.vendor || guessVendor(description),
    excluded: hit.excluded,
  };
}

/* ---------- CSV import state ---------- */

let pendingRows = null;   // array of raw row objects from PapaParse
let pendingFields = null; // detected column headers

function hashTx(t) {
  return [t.date, t.description.trim().toLowerCase(), t.amount.toFixed(2)].join('|');
}

/* =========================================================================
   VIEW SWITCHING
   ========================================================================= */

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
  document.getElementById('view-' + name).classList.add('is-active');
  const tab = document.querySelector(`.tab[data-view="${name}"]`);
  if (tab) tab.classList.add('is-active');
  if (name === 'dashboard') renderDashboard();
  if (name === 'transactions') renderTransactions();
  if (name === 'rules') renderRules();
  if (name === 'data') renderCategoriesTable();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});
document.addEventListener('click', e => {
  const gotoEl = e.target.closest('[data-goto]');
  if (gotoEl) { e.preventDefault(); showView(gotoEl.dataset.goto); }
});

/* =========================================================================
   DASHBOARD
   ========================================================================= */

let categoryChart, trendChart;

function periodFilter(list) {
  const period = document.getElementById('periodSelect').value;
  if (period === 'all') return list;
  const now = new Date();
  return list.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (period === 'last3') {
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return d >= cutoff;
    }
    if (period === 'ytd') return d.getFullYear() === now.getFullYear();
    return true;
  });
}

function renderDashboard() {
  const periodList = periodFilter(transactions);
  const list = periodList.filter(t => !t.excluded);
  const excludedCount = periodList.length - list.length;
  const expenses = list.filter(t => t.amount < 0);
  const income = list.filter(t => t.amount > 0);

  const totalSpent = expenses.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const uncategorized = list.filter(t => t.category === 'Uncategorized').length;

  document.getElementById('statSpent').textContent = fmtMoney(totalSpent);
  document.getElementById('statIncome').textContent = fmtMoney(totalIncome);
  document.getElementById('statCount').textContent = list.length;
  document.getElementById('statUncat').textContent = uncategorized;
  document.getElementById('statExcluded').textContent = excludedCount;

  document.getElementById('emptyDash').hidden = transactions.length > 0;

  // category breakdown
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + Math.abs(t.amount); });
  const catNames = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  const catValues = catNames.map(n => byCat[n]);
  const catColors = catNames.map(n => resolveColor(categoryColor(n)));

  renderChartsSafely(catNames, catValues, catColors);

  // top vendors — rendered independently so a chart-library failure never hides this
  renderTopVendors(expenses);
}

function chartsAvailable() {
  if (typeof Chart === 'undefined') {
    [['categoryChart', 'Spending by category'], ['trendChart', 'Monthly trend']].forEach(([id, label]) => {
      const canvas = document.getElementById(id);
      canvas.style.display = 'none';
      let msg = canvas.nextElementSibling;
      if (!msg || !msg.classList.contains('chart-fallback')) {
        msg = document.createElement('p');
        msg.className = 'empty-state chart-fallback';
        canvas.after(msg);
      }
      msg.textContent = `${label} chart couldn't load — the Chart.js library was blocked (often by an ad blocker or content blocker). Everything else in Ledger still works normally.`;
    });
    return false;
  }
  return true;
}

function renderChartsSafely(catNames, catValues, catColors) {
  if (!chartsAvailable()) return;

  try {
    const ctx1 = document.getElementById('categoryChart');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: catNames,
        datasets: [{ data: catValues, backgroundColor: catColors, borderColor: '#FFFDF8', borderWidth: 2 }],
      },
      options: {
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { family: 'Inter', size: 11 } } } },
        cutout: '58%',
      },
    });
  } catch (err) {
    console.error('Category chart failed to render:', err);
  }

  try {
    // monthly trend, last 6 months present in data (or fewer)
    const months = {};
    transactions.filter(t => t.amount < 0 && !t.excluded).forEach(t => {
      const m = t.date.slice(0, 7);
      months[m] = (months[m] || 0) + Math.abs(t.amount);
    });
    const monthKeys = Object.keys(months).sort().slice(-6);
    const monthLabels = monthKeys.map(m => {
      const [y, mo] = m.split('-');
      return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    });

    const ctx2 = document.getElementById('trendChart');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{ data: monthKeys.map(m => months[m]), backgroundColor: '#A67C3D', borderRadius: 4, maxBarThickness: 40 }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#E3EAD5' }, ticks: { font: { family: 'IBM Plex Mono', size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } },
        },
      },
    });
  } catch (err) {
    console.error('Trend chart failed to render:', err);
  }
}

function renderTopVendors(expenses) {
  const byVendor = {};
  expenses.forEach(t => {
    const key = t.vendor || t.description;
    if (!byVendor[key]) byVendor[key] = { spent: 0, visits: 0, category: t.category };
    byVendor[key].spent += Math.abs(t.amount);
    byVendor[key].visits += 1;
  });
  const topVendors = Object.entries(byVendor).sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);
  const tbody = document.querySelector('#topVendorsTable tbody');
  tbody.innerHTML = topVendors.map(([vendor, v]) => `
    <tr>
      <td>${escapeHtml(vendor)}</td>
      <td>${catPill(v.category)}</td>
      <td class="num">${fmtMoney(v.spent)}</td>
      <td class="num">${v.visits}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="empty-state">No expenses in this period.</td></tr>';
}

// resolves a CSS var() string to an actual color for Chart.js
function resolveColor(v) {
  if (v.startsWith('var(')) {
    const varName = v.slice(4, -1);
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#8A9A8D';
  }
  return v;
}

document.getElementById('periodSelect').addEventListener('change', renderDashboard);

/* =========================================================================
   TRANSACTIONS
   ========================================================================= */

let txPage = 0;
const PAGE_SIZE = 50;

function catPill(name) {
  const color = resolveColor(categoryColor(name));
  return `<span class="cat-pill"><span class="cat-dot" style="background:${color}"></span>${escapeHtml(name)}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function populateCategorySelects() {
  const selects = [
    document.getElementById('txCategoryFilter'),
    document.getElementById('ruleCategory'),
  ];
  selects.forEach(sel => {
    const keepFirst = sel.id === 'txCategoryFilter';
    const current = sel.value;
    sel.innerHTML = (keepFirst ? '<option value="">All</option>' : '') +
      categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  });
}

function filteredTransactions() {
  const q = document.getElementById('txSearch').value.trim().toLowerCase();
  const cat = document.getElementById('txCategoryFilter').value;
  const type = document.getElementById('txTypeFilter').value;
  return transactions
    .filter(t => !q || t.description.toLowerCase().includes(q) || (t.vendor || '').toLowerCase().includes(q))
    .filter(t => !cat || t.category === cat)
    .filter(t => {
      if (type === 'expense') return t.amount < 0;
      if (type === 'income') return t.amount > 0;
      if (type === 'uncategorized') return t.category === 'Uncategorized';
      if (type === 'excluded') return !!t.excluded;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function renderTransactions() {
  populateCategorySelects();
  const list = filteredTransactions();
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  txPage = Math.min(txPage, totalPages - 1);
  const pageItems = list.slice(txPage * PAGE_SIZE, txPage * PAGE_SIZE + PAGE_SIZE);

  const tbody = document.querySelector('#txTable tbody');
  document.getElementById('txEmpty').hidden = list.length > 0;

  tbody.innerHTML = pageItems.map(t => `
    <tr data-id="${t.id}" class="${t.excluded ? 'is-excluded' : ''}">
      <td class="date">${fmtDate(t.date)}</td>
      <td class="desc-cell">${escapeHtml(t.description)}</td>
      <td class="vendor-cell">${escapeHtml(t.vendor || '')}</td>
      <td class="num">
        <input type="number" step="0.01" class="amount-input" data-id="${t.id}" value="${t.amount.toFixed(2)}">
      </td>
      <td>
        <select class="row-category" data-id="${t.id}">
          ${categories.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === t.category ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </td>
      <td>
        <label class="exclude-toggle">
          <input type="checkbox" class="row-exclude" data-id="${t.id}" ${t.excluded ? 'checked' : ''}>
          ${t.excluded ? 'Excluded' : 'Include'}
        </label>
      </td>
      <td class="action-cell"><button class="icon-btn" data-rule-from="${t.id}" title="Create a rule from this transaction">＋ rule</button></td>
    </tr>`).join('');

  // pager
  const pager = document.getElementById('txPager');
  if (totalPages <= 1) {
    pager.innerHTML = '';
  } else {
    let html = `<button ${txPage === 0 ? 'disabled' : ''} data-page="${txPage - 1}">‹ Prev</button>`;
    html += `<span>Page ${txPage + 1} of ${totalPages}</span>`;
    html += `<button ${txPage >= totalPages - 1 ? 'disabled' : ''} data-page="${txPage + 1}">Next ›</button>`;
    pager.innerHTML = html;
  }
}

document.getElementById('txPager').addEventListener('click', e => {
  const btn = e.target.closest('button[data-page]');
  if (!btn) return;
  txPage = parseInt(btn.dataset.page, 10);
  renderTransactions();
});

['txSearch', 'txCategoryFilter', 'txTypeFilter'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { txPage = 0; renderTransactions(); });
});

document.querySelector('#txTable tbody').addEventListener('change', e => {
  const catSel = e.target.closest('select.row-category');
  if (catSel) {
    const t = transactions.find(t => t.id === catSel.dataset.id);
    if (!t) return;
    t.category = catSel.value;
    t.manualOverride = true;
    persistTx();
    toast('Category updated');
    renderDashboard();
    return;
  }

  const amtInput = e.target.closest('input.amount-input');
  if (amtInput) {
    const t = transactions.find(t => t.id === amtInput.dataset.id);
    if (!t) return;
    const val = parseFloat(amtInput.value);
    if (isNaN(val)) {
      amtInput.value = t.amount.toFixed(2);
      toast("That doesn't look like a valid amount");
      return;
    }
    t.amount = val;
    persistTx();
    toast('Amount updated');
    renderTransactions();
    renderDashboard();
    return;
  }

  const exclCheck = e.target.closest('input.row-exclude');
  if (exclCheck) {
    const t = transactions.find(t => t.id === exclCheck.dataset.id);
    if (!t) return;
    t.excluded = exclCheck.checked;
    t.manualExcluded = true;
    persistTx();
    toast(t.excluded ? 'Transaction excluded from totals' : 'Transaction included again');
    renderTransactions();
    renderDashboard();
    return;
  }
});

document.querySelector('#txTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button[data-rule-from]');
  if (!btn) return;
  const t = transactions.find(t => t.id === btn.dataset.ruleFrom);
  if (!t) return;
  showView('rules');
  document.getElementById('ruleAction').value = 'categorize';
  updateRuleFormVisibility();
  document.getElementById('ruleMatch').value = t.vendor || guessVendor(t.description);
  document.getElementById('ruleVendor').value = t.vendor || guessVendor(t.description);
  document.getElementById('ruleCategory').value = t.category !== 'Uncategorized' ? t.category : categories[0].name;
  document.getElementById('ruleMatch').focus();
});

document.getElementById('reapplyRulesBtn').addEventListener('click', () => {
  let changed = 0;
  transactions.forEach(t => {
    const hit = applyRules(t.description);
    if (!t.manualOverride && hit.category && (hit.category !== t.category || hit.vendor !== t.vendor)) {
      t.category = hit.category;
      t.vendor = hit.vendor;
      changed++;
    }
    if (!t.manualExcluded && hit.excluded !== !!t.excluded) {
      t.excluded = hit.excluded;
      changed++;
    }
  });
  persistTx();
  renderTransactions();
  renderDashboard();
  toast(`Re-applied rules — ${changed} transaction${changed === 1 ? '' : 's'} updated`);
});

/* =========================================================================
   RULES
   ========================================================================= */

function renderRules() {
  populateCategorySelects();
  document.getElementById('ruleCount').textContent = rules.length;
  document.getElementById('rulesEmpty').hidden = rules.length > 0;
  const tbody = document.querySelector('#rulesTable tbody');
  tbody.innerHTML = rules.map((r, i) => `
    <tr data-index="${i}">
      <td class="date">${i + 1}</td>
      <td><code>${escapeHtml(r.match)}</code></td>
      <td>${escapeHtml(r.vendor || '—')}</td>
      <td>${r.type === 'exclude' ? '<span class="cat-pill" style="background:#F3DEDC;color:#7A2E28"><span class="cat-dot" style="background:var(--rule-red)"></span>Excluded</span>' : catPill(r.category)}</td>
      <td><button class="icon-btn" data-delete-rule="${i}" title="Delete rule">✕</button></td>
    </tr>`).join('');
}

function updateRuleFormVisibility() {
  const isExclude = document.getElementById('ruleAction').value === 'exclude';
  document.getElementById('ruleCategoryWrap').hidden = isExclude;
  document.getElementById('ruleCategory').required = !isExclude;
}
document.getElementById('ruleAction').addEventListener('change', updateRuleFormVisibility);
updateRuleFormVisibility();

document.getElementById('ruleForm').addEventListener('submit', e => {
  e.preventDefault();
  const match = document.getElementById('ruleMatch').value.trim();
  const action = document.getElementById('ruleAction').value;
  const vendor = document.getElementById('ruleVendor').value.trim();
  const category = document.getElementById('ruleCategory').value;
  if (!match) return;
  if (action === 'categorize' && (!vendor || !category)) return;

  const rule = action === 'exclude'
    ? { match, vendor: vendor || null, category: null, type: 'exclude' }
    : { match, vendor, category, type: 'categorize' };
  rules.push(rule);
  persistRules();
  e.target.reset();
  updateRuleFormVisibility();
  renderRules();

  // apply immediately to existing matching transactions (respecting manual overrides)
  let applied = 0;
  transactions.forEach(t => {
    if (!t.description.toLowerCase().includes(match.toLowerCase())) return;
    if (action === 'exclude') {
      if (!t.manualExcluded && !t.excluded) { t.excluded = true; applied++; }
    } else {
      if (!t.manualOverride) { t.category = category; t.vendor = vendor; applied++; }
    }
  });
  persistTx();
  renderTransactions();
  renderDashboard();
  toast(`Rule added — applied to ${applied} matching transaction${applied === 1 ? '' : 's'}`);
});

document.querySelector('#rulesTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button[data-delete-rule]');
  if (!btn) return;
  const idx = parseInt(btn.dataset.deleteRule, 10);
  rules.splice(idx, 1);
  persistRules();
  renderRules();
});

/* =========================================================================
   IMPORT
   ========================================================================= */

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

document.getElementById('browseBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

['dragenter', 'dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('is-dragover'); }));
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('is-dragover'); }));
dropzone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (typeof Papa === 'undefined') {
    toast("CSV reader didn't load — check that papaparse.min.js is uploaded alongside index.html");
    return;
  }
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: results => {
      if (!results.data.length) { toast('That file looks empty.'); return; }
      pendingRows = results.data;
      pendingFields = results.meta.fields;
      openMapping();
    },
    error: err => toast('Could not read that file: ' + err.message),
  });
}

function openMapping() {
  document.getElementById('mappingPanel').hidden = false;
  document.getElementById('detectedCols').textContent = pendingFields.join(', ');

  const fillSelect = (id) => {
    const sel = document.getElementById(id);
    sel.innerHTML = pendingFields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
  };
  ['mapDate', 'mapDescription', 'mapAmount', 'mapDebit', 'mapCredit'].forEach(fillSelect);

  // best-effort auto-detection
  const guess = (patterns) => pendingFields.find(f => patterns.some(p => f.toLowerCase().includes(p)));
  const dateGuess = guess(['date']);
  const descGuess = guess(['description', 'memo', 'narrative', 'details', 'payee']);
  const amountGuess = guess(['amount', 'value']);
  const debitGuess = guess(['debit', 'withdrawal', 'money out']);
  const creditGuess = guess(['credit', 'deposit', 'money in']);
  if (dateGuess) document.getElementById('mapDate').value = dateGuess;
  if (descGuess) document.getElementById('mapDescription').value = descGuess;
  if (amountGuess) document.getElementById('mapAmount').value = amountGuess;
  if (debitGuess) document.getElementById('mapDebit').value = debitGuess;
  if (creditGuess) document.getElementById('mapCredit').value = creditGuess;
  document.getElementById('mapAmountMode').value = (debitGuess && creditGuess && !amountGuess) ? 'debitCredit' : 'single';
  toggleAmountMode();

  renderPreview();
}

document.getElementById('mapAmountMode').addEventListener('change', toggleAmountMode);
function toggleAmountMode() {
  const mode = document.getElementById('mapAmountMode').value;
  document.getElementById('mapAmountSingleWrap').hidden = mode !== 'single';
  document.getElementById('mapFlipWrap').hidden = mode !== 'single';
  document.getElementById('mapDebitWrap').hidden = mode !== 'debitCredit';
  document.getElementById('mapCreditWrap').hidden = mode !== 'debitCredit';
  renderPreview();
}

['mapDate', 'mapDescription', 'mapAmount', 'mapDebit', 'mapCredit', 'mapFlip'].forEach(id =>
  document.getElementById(id).addEventListener('change', renderPreview));

function parseAmount(str) {
  if (str == null) return NaN;
  const cleaned = String(str).replace(/[£$€,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return parseFloat(cleaned);
}

function parseDateFlexible(str) {
  if (!str) return null;
  str = String(str).trim();
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    // heuristic: if first part > 12, it's a day
    let day, month;
    if (parseInt(a, 10) > 12) { day = a; month = b; }
    else if (parseInt(b, 10) > 12) { day = b; month = a; }
    else { day = a; month = b; } // ambiguous — assume DD/MM (most non-US banks)
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

function buildRowsFromMapping() {
  const dateCol = document.getElementById('mapDate').value;
  const descCol = document.getElementById('mapDescription').value;
  const mode = document.getElementById('mapAmountMode').value;
  const amountCol = document.getElementById('mapAmount').value;
  const debitCol = document.getElementById('mapDebit').value;
  const creditCol = document.getElementById('mapCredit').value;
  const flip = document.getElementById('mapFlip').value === 'yes';
  const account = document.getElementById('mapAccount').value.trim();

  return pendingRows.map(row => {
    const date = parseDateFlexible(row[dateCol]);
    const description = (row[descCol] || '').trim();
    let amount;
    if (mode === 'single') {
      amount = parseAmount(row[amountCol]);
      if (flip) amount = -amount;
    } else {
      const debit = parseAmount(row[debitCol]) || 0;
      const credit = parseAmount(row[creditCol]) || 0;
      amount = credit - Math.abs(debit || 0);
    }
    return { date, description, amount, account };
  }).filter(r => r.date && r.description && !isNaN(r.amount));
}

function renderPreview() {
  if (!pendingRows) return;
  const rows = buildRowsFromMapping().slice(0, 6);
  const thead = document.querySelector('#previewTable thead');
  const tbody = document.querySelector('#previewTable tbody');
  thead.innerHTML = '<tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr>';
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="date">${escapeHtml(r.date || '—')}</td>
      <td>${escapeHtml(r.description)}</td>
      <td class="num ${r.amount < 0 ? 'amount-neg' : 'amount-pos'}">${isNaN(r.amount) ? '—' : fmtMoney(r.amount)}</td>
    </tr>`).join('');
  document.getElementById('importResult').textContent = '';
}

document.getElementById('cancelImportBtn').addEventListener('click', resetImport);
function resetImport() {
  pendingRows = null;
  pendingFields = null;
  document.getElementById('mappingPanel').hidden = true;
  fileInput.value = '';
}

document.getElementById('confirmImportBtn').addEventListener('click', () => {
  const rowsBuilt = buildRowsFromMapping();
  if (!rowsBuilt.length) { toast('No valid rows found — check your column mapping.'); return; }

  const existingHashes = new Set(transactions.map(hashTx));
  let added = 0, skipped = 0;

  rowsBuilt.forEach(r => {
    const base = { date: r.date, description: r.description, amount: r.amount };
    const h = hashTx(base);
    if (existingHashes.has(h)) { skipped++; return; }
    existingHashes.add(h);
    const cat = categorize(r.description);
    transactions.push({
      id: crypto.randomUUID(),
      date: r.date,
      description: r.description,
      amount: r.amount,
      account: r.account || '',
      category: cat.category,
      vendor: cat.vendor,
      excluded: cat.excluded,
      manualOverride: false,
      manualExcluded: false,
    });
    added++;
  });

  persistTx();
  updateLastUpdated();
  document.getElementById('importResult').textContent = `Imported ${added}, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`;
  toast(`Added ${added} transaction${added === 1 ? '' : 's'}`);
  renderDashboard();
});

/* =========================================================================
   CATEGORIES & DATA
   ========================================================================= */

const PALETTE_VARS = ['--cat-1','--cat-2','--cat-3','--cat-4','--cat-5','--cat-6','--cat-7','--cat-8','--cat-9','--cat-10','--cat-11','--cat-12'];

function renderCategoriesTable() {
  const tbody = document.querySelector('#categoriesTable tbody');
  tbody.innerHTML = categories.map((c, i) => `
    <tr>
      <td><span class="cat-dot" style="display:inline-block;background:${resolveColor(c.color)}"></span></td>
      <td>${escapeHtml(c.name)}</td>
      <td>${c.name === 'Uncategorized' ? '' : `<button class="icon-btn" data-delete-cat="${i}" title="Delete category">✕</button>`}</td>
    </tr>`).join('');
}

document.getElementById('categoryForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  if (!name) return;
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast('That category already exists.'); return; }
  const color = `var(${PALETTE_VARS[categories.length % PALETTE_VARS.length]})`;
  categories.push({ name, color });
  persistCats();
  input.value = '';
  renderCategoriesTable();
  populateCategorySelects();
  toast('Category added');
});

document.querySelector('#categoriesTable tbody').addEventListener('click', e => {
  const btn = e.target.closest('button[data-delete-cat]');
  if (!btn) return;
  const idx = parseInt(btn.dataset.deleteCat, 10);
  const cat = categories[idx];
  const inUse = transactions.filter(t => t.category === cat.name).length;
  if (!confirm(`Delete "${cat.name}"? ${inUse} transaction(s) using it will move to Uncategorized.`)) return;
  transactions.forEach(t => { if (t.category === cat.name) t.category = 'Uncategorized'; });
  categories.splice(idx, 1);
  persistCats();
  persistTx();
  renderCategoriesTable();
  populateCategorySelects();
  toast('Category deleted');
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const backup = { exportedAt: new Date().toISOString(), transactions, rules, categories };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importJsonBtn').addEventListener('click', () => document.getElementById('importJsonInput').click());
document.getElementById('importJsonInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.transactions)) throw new Error('Not a valid backup file');
      if (!confirm('This will replace all current data with the backup. Continue?')) return;
      transactions = data.transactions || [];
      rules = data.rules || [];
      categories = data.categories && data.categories.length ? data.categories : DEFAULT_CATEGORIES;
      persistTx(); persistRules(); persistCats();
      updateLastUpdated();
      renderAll();
      toast('Backup restored');
    } catch (err) {
      toast('Could not read that backup file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('clearAllBtn').addEventListener('click', () => {
  if (!confirm('Erase ALL transactions, rules, and custom categories? This cannot be undone.')) return;
  transactions = []; rules = []; categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  persistTx(); persistRules(); persistCats();
  updateLastUpdated();
  renderAll();
  toast('All data erased');
});

/* =========================================================================
   INIT
   ========================================================================= */

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (!transactions.length) { el.textContent = 'No entries yet'; return; }
  el.textContent = `${transactions.length} entries kept locally`;
}

function renderAll() {
  populateCategorySelects();
  renderDashboard();
  renderTransactions();
  renderRules();
  renderCategoriesTable();
}

updateLastUpdated();
renderAll();
