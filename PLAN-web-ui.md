# faqmd Web UI — Build Plan

## Goal

Add a web UI to faqmd where users paste a GameFAQs walkthrough URL and download the converted markdown. UI served at `faqmd.dev/convert/`. API handled by Cloudflare Worker at `faqmd.dev/api/convert`.

## Architecture

```
faqmd.dev (Cloudflare proxy)
├── /convert/index.html     ← Static UI (GitHub Pages, existing pipeline)
├── /convert/style.css
├── /convert/app.js
└── /api/convert            ← Cloudflare Worker (no CORS needed, same origin)
    POST { url } → { success, markdown, title, sections, faqId }

Local development:
node server.js → localhost:3000
  GET  /           → convert/index.html
  GET  /convert/*  → static files from convert/
  POST /api/convert → runs lib/converter.js
```

## Files to Create

| # | File | Purpose |
|---|---|---|
| 1 | `package.json` | Dependencies: express, cors |
| 2 | `lib/converter.js` | Refactored core — all conversion functions exported + convert() orchestrator |
| 3 | `lib/validator.js` | URL validation + SSRF guard |
| 4 | `server.js` | Express server: serves UI + POST /api/convert |
| 5 | `convert/index.html` | UI page |
| 6 | `convert/style.css` | Styling |
| 7 | `convert/app.js` | Client logic |
| 8 | `worker.js` | Cloudflare Worker — self-contained, inlined conversion logic |
| 9 | `wrangler.toml` | Worker config for repeatable `npx wrangler deploy` |

## Files to Modify

| # | File | Change |
|---|---|---|
| 10 | `scripts/convert.js` | Rewrite as thin CLI wrapper: imports lib/converter.js |
| 11 | `.gitignore` | Add node_modules/, .env, results/ |
| 12 | `AGENTS.md` | Add docs for all new files |

## File Specifications

---

### 1. `package.json`

```json
{
  "name": "faqmd",
  "version": "1.1.0",
  "description": "GameFAQs walkthrough to markdown converter",
  "main": "lib/converter.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5"
  }
}
```

Run `npm install`.

---

### 2. `lib/converter.js` — Core refactor

**Extract every function** from the current `scripts/convert.js` (lines 9-93) into named exports. Remove the IIFE main() block.

#### Exported functions:

```js
async function fetchHtml(url, timeoutMs = 15000)
```
- Same logic as current `https.get()` wrapper (lines 9-17)
- Add: `setTimeout` destroy with `timeoutMs`
- Add: track received bytes, abort if > 10MB
- Add: reject if `res.statusCode !== 200`

```js
function extractText(html)
```
- Identical to current lines 20-26

```js
function parseTOC(text)
```
- Identical to current lines 28-42

```js
function splitSections(text, tocEntries)
```
- Identical to current lines 45-73

```js
function escapeMd(t)
```
- Identical to current line 76

```js
function anchorId(e)
```
- Identical to current line 77

```js
function formatContent(content)
```
- Identical to current lines 81-93

```js
function extractMetadata(html)
```
**New.** Parse `<title>` tag for game name and author:
```js
function extractMetadata(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return { gameTitle: 'Walkthrough', author: 'Unknown Author' };

  let author = 'Unknown Author';
  const authorMatch = m[1].match(/\bby\s+(.+?)(?:\s*[-–|;(]\s*|\s+for\s+)/i);
  if (authorMatch) author = authorMatch[1].trim();

  let gameTitle = m[1]
    .replace(/\bby\s+.+?(?:\s*[-–|;(]\s*|\s+for\s+)/i, '')
    .replace(/\s*[-–|]\s*(FAQ\/Walkthrough|Walkthrough|FAQ).*/i, '')
    .replace(/\s+for\s+GameFAQs.*$/i, '')
    .trim();

  return { gameTitle: gameTitle || 'Walkthrough', author };
}
```

```js
function buildMarkdown(sections, author, gameTitle)
```
**New.** No hardcoded "Seb Holt". Logic:
```js
function buildMarkdown(sections, author, gameTitle) {
  let md = `# ${gameTitle}\n\n`;
  md += `> By ${author} — Converted from GameFAQs\n\n`;
  md += '## Table of Contents\n\n';
  for (const s of sections) {
    md += '  '.repeat(s.level - 1) + '- [' + s.num + '. ' + escapeMd(s.title) + '](#' + anchorId(s) + ')\n';
  }
  md += '\n---\n\n';
  for (const s of sections) {
    md += '<a id="' + anchorId(s) + '"></a>\n\n';
    md += '#'.repeat(s.level) + ' ' + s.num + '. ' + s.title + '\n\n';
    md += formatContent(s.content) + '\n\n';
  }
  return md;
}
```

```js
async function convert(input)
```
**New.** Orchestrator:
- `input` can be:
  - `null`/`undefined` → read `scripts/raw.txt` (backward compat for CLI)
  - string starting with `http` → `fetchHtml(url)`
  - other string → `fs.readFileSync(input)` (local file path)
- Calls: `extractText` → `parseTOC` → throws if 0 TOC entries → `splitSections` → `extractMetadata` → `buildMarkdown`
- Extract `faqId` from URL: `input?.match(/faqs\/(\d+)/)?.[1]`
- Returns: `{ markdown, title, sections, faqId, author }`

---

### 3. `lib/validator.js`

```js
const GAMEFAQS_RE = /^https:\/\/gamefaqs\.gamespot\.com\/(\w+)\/([\w-]+)\/faqs\/(\d+)/i;

function validateWalkthroughUrl(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('URL is required');
  const m = input.trim().match(GAMEFAQS_RE);
  if (!m) throw new Error('URL must be a GameFAQs walkthrough (gamefaqs.gamespot.com/.../faqs/...?print=1)');
  let url = m[0];
  if (!url.includes('?')) url += '?print=1';
  else if (!url.includes('print=1')) url += '&print=1';
  return { url, platform: m[1], gameSlug: m[2], faqId: m[3] };
}

module.exports = { validateWalkthroughUrl };
```

---

### 4. `server.js`

```js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { convert } = require('./lib/converter');
const { validateWalkthroughUrl } = require('./lib/validator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/convert', express.static(path.join(__dirname, 'convert')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'convert', 'index.html')));

app.post('/api/convert', async (req, res) => {
  if (!req.body || typeof req.body.url !== 'string' || !req.body.url.trim()) {
    return res.status(400).json({ success: false, error: 'Missing "url" in request body' });
  }
  try {
    const validated = validateWalkthroughUrl(req.body.url.trim());
    const result = await Promise.race([
      convert(validated.url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Conversion timed out')), 60000))
    ]);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error:', err.message);
    const status = err.message.includes('No sections found') || err.message.includes('URL must be') || err.message.includes('URL is required') ? 400 : 502;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`faqmd on http://localhost:${PORT}`));
```

---

### 5-7. UI Files (`convert/`)

#### `convert/index.html`

Single page with 4 sections controlled by class `hidden`:

| Section | ID | Contents |
|---|---|---|
| Input | `#input-section` | `<form id="convert-form">` with `<input type="url" id="url-input" required>` + `<button id="convert-btn">Convert</button>` |
| Loading | `#loading-section` (hidden) | Spinner div + "Converting..." text |
| Error | `#error-section` (hidden) | `#error-message` + `#retry-btn` |
| Results | `#results-section` (hidden) | `#result-title`, `#result-stats`, `#download-btn`, `#preview-toggle-btn`, `#preview-area` (hidden) with `<pre id="markdown-preview">` |

Page includes `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, `<link rel="stylesheet" href="/convert/style.css">`, `<script src="/convert/app.js" defer></script>`. Footer links to GitHub repo.

#### `convert/style.css`

- CSS custom properties: `--bg`, `--card-bg`, `--text`, `--accent`, `--error`, `--success`, `--border`
- `*, *::before, *::after { box-sizing: border-box }` reset
- `.hidden { display: none !important; }`
- Responsive: stack at 600px
- Spinner: border-animated 40px circle
- Preview `<pre>`: monospace, max-height 500px, overflow-y auto, white-space pre-wrap

#### `convert/app.js`

Three event handlers:

1. **`#convert-form submit`**:
   - `e.preventDefault()`
   - Basic client check: URL starts with `https://gamefaqs.gamespot.com/`
   - `fetch('/api/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })`
   - On success: populate results, show `#results-section`
   - On error: populate `#error-message`, show `#error-section`
   - Store `lastResult` globally

2. **`#download-btn click`**:
   ```js
   const blob = new Blob([lastResult.markdown], { type: 'text/markdown' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `walkthrough-${lastResult.faqId || 'export'}.md`;
   a.click();
   URL.revokeObjectURL(url);
   ```

3. **`#preview-toggle-btn click`**:
   - Toggle `#preview-area.hidden`
   - Set `#markdown-preview.textContent = lastResult.markdown`
   - Toggle button text "Preview" / "Hide Preview"

4. **`#retry-btn click`**: Restore URL, show `#input-section`

**No innerHTML anywhere. All dynamic text via textContent.**

---

### 8. `worker.js` — Cloudflare Worker

Self-contained file. All conversion functions inlined (same logic as `lib/converter.js`). Key differences:

| Aspect | `lib/converter.js` | `worker.js` |
|---|---|---|
| Module format | CommonJS | ES module |
| HTTP fetch | `https.get()` | `fetch()` with User-Agent header |
| File system | Handles raw.txt / local file paths | Never reads disk (always fetches URL) |
| Error: 0 sections | Throws | Throws same error |

Entry point:
```js
export default {
  async fetch(request) {
    // CORS preflight for local dev
    // POST /api/convert → validate → convert → return JSON
    // All other routes → 404
  }
}
```

Key details:
- `fetch()` call includes: `headers: { 'User-Agent': 'faqmd/1.0 (https://faqmd.dev/convert)' }` and `signal: AbortSignal.timeout(15000)`
- Auth check: regex `https://gamefaqs.gamespot.com/.../faqs/\d+`
- Auto-appends `?print=1`
- Returns same JSON shape as Express API
- CORS preflight returns `Access-Control-Allow-Origin: *` for local dev testing

---

### 9. `wrangler.toml`

```toml
name = "faqmd-convert"
compatibility_date = "2024-09-23"
route = "faqmd.dev/api/convert"
workers_dev = false
```

No `account_id` — auto-detected when logged in.

---

### 10. `scripts/convert.js` — CLI wrapper (rewritten)

```js
#!/usr/bin/env node
const { convert } = require('../lib/converter');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const input = process.argv[2];  // URL, file path, or undefined (uses raw.txt)
    const output = process.argv[3] || path.join(process.cwd(), 'walkthrough.md');
    const result = await convert(input || null);
    fs.writeFileSync(output, result.markdown);
    console.log(`Saved ${result.markdown.length} bytes to ${output} (${result.sections} sections)`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
```

Backward compat verified:
- `node scripts/convert.js` — reads `scripts/raw.txt`
- `node scripts/convert.js "https://..."` — fetches and converts
- `node scripts/convert.js "https://..." output.md` — writes to output.md
- `node scripts/convert.js path/to/file.html` — reads local file

---

### 11. `.gitignore` — Append

```
node_modules/
.env
results/
```

Existing entries (raw.txt, walkthrough.md, guide/, etc.) remain.

---

### 12. `AGENTS.md` — Update

Add under "Key Files":
```
- `lib/converter.js` — Shared conversion core (CLI + server)
- `lib/validator.js` — URL validation with SSRF guard
- `server.js` — Express server: UI + API (local dev)
- `convert/` — UI files for production (faqmd.dev/convert/) and local dev
- `worker.js` — Cloudflare Worker for production API
- `wrangler.toml` — Worker deployment config
```

Add under "Conventions":
```
- worker.js duplicates conversion logic from lib/converter.js — update both if changing parsing
```

Add under "Usage":
```
Web UI (local):  node server.js → http://localhost:3000
Production UI:   https://faqmd.dev/convert/
Deploy worker:   cd faqmd && npx wrangler deploy
```

---

## Known Limitation: Free Plan CPU Time

Cloudflare Workers free plan has **10ms CPU time per request** (wall-clock is unlimited). Regex-heavy conversion of large walkthroughs (>500KB, 200+ sections) may exceed this. If conversion fails silently:
- Upgrade to Workers Paid ($5/mo) for 30s CPU limit
- Or use the CLI locally: `node scripts/convert.js <url>`

---

## Deployment Steps (for you, after build model finishes)

1. **GitHub Pages**: Build model pushes to `main`. Deploy workflow auto-deploys `convert/` to `faqmd.dev/convert/`.

2. **Cloudflare Worker**:
   ```bash
   cd /path/to/faqmd
   npx wrangler login
   npx wrangler deploy
   ```

3. **Verify**: Visit `faqmd.dev/convert/`, paste a walkthrough URL, submit, download .md.

---

## Verification Checklist

| # | Command | Expected |
|---|---|---|
| 1 | `node scripts/convert.js` | Falls back to raw.txt, writes walkthrough.md |
| 2 | `node scripts/convert.js "https://gamefaqs.gamespot.com/genesis/563334-phantasy-star-iv/faqs/31907?print=1" test.md` | Writes test.md with content |
| 3 | `node -e "require('./lib/converter').convert('https://gamefaqs.gamespot.com/genesis/563334-phantasy-star-iv/faqs/31907?print=1').then(r => console.log(r.sections))"` | Number > 0 |
| 4 | `node server.js &` then `curl -X POST http://localhost:3000/api/convert -H 'Content-Type: application/json' -d '{"url":"https://gamefaqs.gamespot.com/genesis/563334-phantasy-star-iv/faqs/31907?print=1"}'` | JSON with `success: true` and markdown |
| 5 | `curl http://localhost:3000/convert/` | Returns HTML |
| 6 | `node -e "require('fs').existsSync('wrangler.toml')"` | true |
| 7 | `node -e "require('fs').readFileSync('worker.js','utf8').includes('export default')"` | true |

---

## Post-Plan: Reader Mobile Fix (implemented)

### Root Cause

On mobile, the `<script type="module">` in `reader.html` failed to load the CDN-hosted `marked@14.1.4` ESM file (93KB unminified). Slow mobile networks or Safari's module handling caused the import to fail silently, which meant no JS ran at all — "Loading guide..." persisted forever and the sidebar couldn't open.

### Changes Made (faqmd-content)

| # | Change | File |
|---|---|---|
| 1 | Bundled `marked.js` locally from CDN | `marked.js` (new, 92,854 bytes) |
| 2 | Updated import from CDN URL to `./marked.js` | `reader.html:345` |
| 3 | Wrapped `loadToc()` in try/catch with user-facing error messages | `reader.html:352-378` |
| 4 | Added empty TOC state ("Guide not available.") | `reader.html:380-386` |
| 5 | Improved `loadSection()` error messages (context-aware) | `reader.html:419-425` |
| 6 | Added sidebar backdrop dismissal on mobile | `reader.html:497-499` |
| 7 | Added `console.warn` for fetch failures | Multiple locations |
| 8 | Updated deploy workflow to copy `marked.js` | `faqmd/.github/workflows/deploy.yml` (later moved) |

### Post-Plan: Deploy Workflow Moved (implemented)

The deploy workflow was moved from the public `faqmd` repo to the private `faqmd-content` repo, so pushes to `faqmd-content` (where the content actually lives) trigger immediate deployment.

**Changes:**
- `faqmd-content/.github/workflows/deploy.yml` — Created (deploys to `danielcurran/faqmd` gh-pages via external_repository + DEPLOY_TOKEN PAT)
- `faqmd/.github/workflows/deploy.yml` — Deleted

**One-time setup:** A GitHub PAT with `Contents: write` on `danielcurran/faqmd` saved as `DEPLOY_TOKEN` secret in `faqmd-content`.|
