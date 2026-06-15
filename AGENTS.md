# faqmd-walkthroughs — gamemds.org Site

## Purpose
Hosts GameFAQs walkthrough content served at [gamemds.org](https://gamemds.org).

## Repository Separation
This repo contains the **site** — walkthrough content, reader app, landing page,
and deploy workflow. The converter tool lives in a separate repo:
- **[faqmd](https://github.com/danielcurran/faqmd)** — scripts and opencode agent skills

## Key Files
- `reader.html` — Walkthrough reader app. Imports `marked.js` for markdown rendering, fetches `guide/toc.json` for sidebar TOC, loads per-section `.md` files on navigation.
- `index.html` — Landing page at gamemds.org. Lists available walkthroughs.
- `guide/` — Walkthrough section files: `index.md` (Table of Contents), `toc.json` (machine-readable TOC), and one `.md` file per section.
- `marked.js` — Vendored markdown parser (marked v14). Loaded locally to avoid mobile CDN loading issues.
- `CNAME` — Contains `gamemds.org` — GitHub Pages custom domain.
- `.nojekyll` — Empty file to disable Jekyll processing.
- `.github/workflows/deploy.yml` — Deploys repo root to `gh-pages` branch on push to `main`.

## Deploy
- Workflow: `.github/workflows/deploy.yml`
- Triggers: push to `main`, manual `workflow_dispatch`, daily at 06:00 UTC
- Uses `peaceiris/actions-gh-pages@v4` with `force_orphan: true`

## Conventions
- `guide/index.md` must link to all section files with correct filenames
- `reader.html` imports `marked.js` locally (path: `./marked.js`)
- `CNAME` must always contain `gamemds.org`
- `reader.html` title and author metadata in `#attribution` must match the walkthrough content
- Do not load marked from CDN — the local copy prevents mobile loading failures

## Usage
Deploy: push to `main` — the workflow auto-deploys.
Add walkthrough: see README.md in this repo for the full pipeline.
