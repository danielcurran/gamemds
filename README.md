# faqmd-walkthroughs

Walkthrough content for [gamemds.org](https://gamemds.org).

This repo is the **site** — it hosts walkthrough markdown files, the reader app,
the landing page, and GitHub Pages configuration. The converter tool that generates
walkthroughs lives in the separate **[faqmd](https://github.com/danielcurran/faqmd)** repo.

## Repository Roles

| Repo | Purpose |
|---|---|
| **[faqmd](https://github.com/danielcurran/faqmd)** | Converter tool + opencode agent skills |
| **faqmd-walkthroughs** (this repo) | Walkthrough content hosted at [gamemds.org](https://gamemds.org) |

## Structure

| Path | Purpose |
|---|---|
| `guide/` | Walkthrough section files — `index.md` (Table of Contents) + per-section `.md` + `toc.json` |
| `reader.html` | Walkthrough viewer app — renders `guide/` sections with sidebar navigation and search |
| `index.html` | Landing page at [gamemds.org](https://gamemds.org) |
| `marked.js` | Vendored markdown parsing library (loaded locally, not from CDN) |
| `CNAME` | Custom domain — `gamemds.org` |
| `.nojekyll` | Disables Jekyll preprocessing for GitHub Pages |
| `.github/workflows/deploy.yml` | GitHub Actions — deploys repo to GitHub Pages on push |

## Deploy

Push to `main` triggers the deploy workflow (`.github/workflows/deploy.yml`),
which deploys the repo root to the `gh-pages` branch. GitHub Pages then serves
the content at [gamemds.org](https://gamemds.org).

- **Trigger**: push to `main`, manual `workflow_dispatch`, or daily at 06:00 UTC
- **Action**: `peaceiris/actions-gh-pages@v4` with `force_orphan: true`

## Adding or Updating a Walkthrough

1. Use the [faqmd](https://github.com/danielcurran/faqmd) tool to convert the walkthrough:
   ```bash
   git clone https://github.com/danielcurran/faqmd
   cd faqmd
   node scripts/convert.js "https://gamefaqs.gamespot.com/.../faqs/12345?print=1"
   ```
2. Optionally annotate with RetroAchievements via the opencode agent skill
3. Optionally run quality passes:
   ```bash
   # (in opencode)
   "Run reformat-review on walkthrough.md"
   "Run art-modernize on walkthrough.md"
   ```
4. Split into sections:
   ```bash
   node scripts/split-guide.js walkthrough.md guide/
   ```
5. Copy the generated `guide/` directory into this repo, replacing the existing one
6. Update `reader.html` with the new game title and author
7. Update `index.html` guide-card `data-*` attributes with the new game name and author. The section count loads dynamically from `guide/toc.json`.
8. Commit and push — the site auto-deploys

## Related

- [faqmd](https://github.com/danielcurran/faqmd) — Converter tool + agent skills
