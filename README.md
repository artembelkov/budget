# Ledger — a personal expense tracker

A small, dependency-free website for tracking and categorizing personal
expenses. Upload a bank statement CSV, let vendor rules sort it into
categories, and see where your money goes on a dashboard.

**Everything runs in your browser.** There is no backend and no database —
your transactions are stored in your browser's `localStorage`, on your own
device. Nothing is ever uploaded anywhere. This also means:

- Your data is tied to one browser on one device, unless you export/import
  backups (see below).
- Clearing your browser data will erase it — export a backup first.
- If you use this on multiple devices, use **Categories & Data → Export
  backup** on one and **Restore from backup** on the other to move data over.

## Features

- **Import bank statements** — drop in a CSV, map its columns (date,
  description, amount — or separate debit/credit columns), preview, import.
  Duplicate transactions are skipped automatically on re-import.
- **Vendor rules** — teach Ledger that any description containing, say,
  `TESCO` should be labeled vendor "Tesco" and category "Groceries". Rules
  run automatically on every future import, and can be re-applied to
  existing transactions at any time.
- **Manual categorization** — change a transaction's category directly from
  the Transactions table; it's locked in and won't be overwritten by rules
  later (unless you clear the override by changing it again).
- **Dashboard** — total spent/income, spend by category (donut chart),
  monthly trend (bar chart), and top vendors, filterable by time period.
- **Categories** — a sensible default set (Groceries, Dining, Transport,
  Housing, etc.) that you can extend or trim.
- **Backup & restore** — export all data as a single JSON file, and restore
  it later or on another device/browser.

## Running it locally

No build step, no dependencies to install. Just open `index.html` in a
browser, or serve the folder locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

1. Create a new GitHub repository and push these files (`index.html`,
   `style.css`, `app.js`, `README.md`) to it.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   pick your default branch (e.g. `main`) and the `/ (root)` folder.
4. Save. GitHub will give you a URL like
   `https://yourusername.github.io/your-repo-name/` within a minute or two.

That's it — no CI, no build pipeline. To update the site later, just edit
the files and push; Pages redeploys automatically.

## Preparing your bank statement

Most banks let you export transaction history as CSV from their website
(look for "Export", "Download", or "Statements"). Ledger tries to
auto-detect common column names (Date, Description/Memo, Amount, or
Debit/Credit), but you can always correct the mapping by hand on the Import
screen — the preview updates live so you can check it before importing.

If your bank only offers PDF statements, you'll need to convert to CSV
first (many banks offer this as an alternative export format; some
spreadsheet apps can also import PDF tables directly).

## Project structure

Kept deliberately flat and small so it's easy to maintain:

```
index.html   — page structure, all views
style.css    — all styling (single stylesheet, CSS variables for theming)
app.js       — all logic (storage, import/parsing, rules, charts, rendering)
```

No framework, no bundler, no `node_modules`. Two third-party scripts are
loaded from a CDN for convenience:

- [Chart.js](https://www.chartjs.org/) — dashboard charts
- [PapaParse](https://www.papaparse.com/) — robust CSV parsing

If you'd rather not depend on a CDN, download both libraries and reference
local copies in `index.html` instead.

## Extending it

Everything is in three plain files, so common tweaks are quick:

- **Add a default category** — edit `DEFAULT_CATEGORIES` near the top of
  `app.js` (only affects new/reset installs; existing users add categories
  from the UI).
- **Change the color palette** — edit the CSS variables at the top of
  `style.css` (`--paper`, `--forest`, `--brass`, `--cat-1` … `--cat-12`).
- **Change currency symbol** — edit `fmtMoney` in `app.js`.
