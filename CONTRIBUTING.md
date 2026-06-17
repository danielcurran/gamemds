# Contributing to gamemds

Thanks for wanting to contribute to [gamemds.org](https://gamemds.org)! This repo
hosts the walkthroughs and the reader app. The converter tool lives in the
separate [faqmd](https://github.com/danielcurran/faqmd) repo.

## Ways to Contribute

### Submit a Walkthrough

1. Convert a GameFAQs walkthrough using the [faqmd](https://github.com/danielcurran/faqmd)
   converter tool (see README there for instructions).
2. Optionally annotate with RetroAchievements via opencode's retoachievements skill.
3. Split into sections: `node scripts/split-guide.js walkthrough.md guide/`
4. Copy the `guide/` directory to `guides/<slug>/` in this repo.
5. Add an entry to `guides.json`:
   ```json
   {
     "slug": "my-game",
     "title": "My Game",
     "subtitle": "Guide and Walkthrough",
     "author": "Original Author",
     "desc": "Guide and Walkthrough",
     "path": "guides/my-game",
     "hasAchievements": true
   }
   ```
6. Open a pull request.

### Fix a Bug or Improve the Reader

- Reader app files: `reader.html`, `assets/js/reader.js`, `assets/css/reader.css`
- Landing page: `index.html`, `assets/js/index.js`, `assets/css/index.css`
- Validation: `scripts/validate.js`

### Report an Issue

Open a [bug report](.github/ISSUE_TEMPLATE/bug.yml) or
[feature request](.github/ISSUE_TEMPLATE/feature.yml).

## Getting Started

```bash
git clone https://github.com/danielcurran/gamemds
cd gamemds
npm test
```

## Code Style

- **No new dependencies** — the reader uses vanilla JS and vendored `marked.js` only
- Follow existing patterns in `assets/js/` and `assets/css/`
- 2-space indentation
- CSP headers in all HTML pages

## Validation

Run `npm test` before committing. This validates:
- All required files exist
- `guides.json` is valid
- `toc.json` references match files on disk
- HTML assets are correctly referenced
- CSP headers are present

## Pull Request Checklist

- [ ] `npm test` passes
- [ ] Branch is up to date with `main`
- [ ] Walkthrough submissions include author attribution
- [ ] `guides.json` entry includes `slug`, `title`, `author`, `path`
- [ ] No generated files committed outside `guides/`
