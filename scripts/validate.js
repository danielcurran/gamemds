#!/usr/bin/env node
// Validation suite for the gamemds static site.
// Usage: node scripts/validate.js

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push('FAIL: ' + label + ' — ' + e.message);
  }
}

function fileExists(p) {
  if (!fs.existsSync(p)) throw new Error('missing file: ' + path.relative(ROOT, p));
  const stat = fs.statSync(p);
  if (!stat.isFile()) throw new Error('not a file: ' + path.relative(ROOT, p));
}

function collectTocFiles(nodes, files = new Set()) {
  for (const n of nodes) {
    if (n.file) files.add(n.file);
    if (n.children) collectTocFiles(n.children, files);
  }
  return files;
}

function flattenToc(nodes, flat = []) {
  for (const n of nodes) {
    flat.push(n);
    if (n.children) flattenToc(n.children, flat);
  }
  return flat;
}

function validateGuide(guideDir, label) {
  const dir = path.join(ROOT, guideDir);

  assert(label + '/toc.json exists and is valid JSON', () => {
    fileExists(path.join(dir, 'toc.json'));
    const tocData = JSON.parse(fs.readFileSync(path.join(dir, 'toc.json'), 'utf8'));
    if (!Array.isArray(tocData) || tocData.length === 0) throw new Error('toc.json must be a non-empty array');
    return tocData;
  });

  assert(label + '/meta.json exists and has required fields', () => {
    fileExists(path.join(dir, 'meta.json'));
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    if (typeof meta.title !== 'string' || !meta.title) throw new Error('meta.json missing title');
    if (typeof meta.author !== 'string' || !meta.author) throw new Error('meta.json missing author');
  });

  let tocData, tocFiles, flatToc;
  assert(label + '/toc.json nodes have required fields', () => {
    tocData = JSON.parse(fs.readFileSync(path.join(dir, 'toc.json'), 'utf8'));
    flatToc = flattenToc(tocData);
    for (const n of flatToc) {
      if (typeof n.num !== 'string' || !n.num) throw new Error('missing num: ' + JSON.stringify(n));
      if (typeof n.title !== 'string' || !n.title) throw new Error('missing title: ' + JSON.stringify(n));
      if (typeof n.depth !== 'number') throw new Error('missing depth: ' + JSON.stringify(n));
      if (!Array.isArray(n.children)) throw new Error('missing children array: ' + JSON.stringify(n));
    }
  });

  assert(label + '/toc.json section numbers are unique', () => {
    if (!flatToc) throw new Error('no toc data');
    const nums = new Set();
    for (const n of flatToc) {
      if (nums.has(n.num)) throw new Error('duplicate section number: ' + n.num);
      nums.add(n.num);
    }
  });

  assert(label + '/index.md exists', () => fileExists(path.join(dir, 'index.md')));

  assert(label + '/index.md links point to existing files', () => {
    const indexMd = fs.readFileSync(path.join(dir, 'index.md'), 'utf8');
    const linkRe = /\]\(([^)]+\.md)\)/g;
    let m;
    while ((m = linkRe.exec(indexMd)) !== null) {
      const target = m[1];
      fileExists(path.join(dir, target));
    }
  });

  assert(label + '/toc.json files exist on disk', () => {
    tocData = tocData || JSON.parse(fs.readFileSync(path.join(dir, 'toc.json'), 'utf8'));
    tocFiles = collectTocFiles(tocData);
    for (const f of tocFiles) {
      fileExists(path.join(dir, f));
    }
  });

  assert(label + ' every .md file is referenced in toc.json', () => {
    tocFiles = tocFiles || (() => { tocData = JSON.parse(fs.readFileSync(path.join(dir, 'toc.json'), 'utf8')); return collectTocFiles(tocData); })();
    const mdFiles = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && f !== 'index.md')
      .sort();
    const tocFileList = Array.from(tocFiles).sort();
    if (JSON.stringify(mdFiles) !== JSON.stringify(tocFileList)) {
      const missingFromToc = mdFiles.filter(f => !tocFiles.has(f));
      const missingFromDir = tocFileList.filter(f => !mdFiles.includes(f));
      const parts = [];
      if (missingFromToc.length) parts.push('md files not in toc.json: ' + missingFromToc.join(', '));
      if (missingFromDir.length) parts.push('toc.json files not on disk: ' + missingFromDir.join(', '));
      throw new Error(parts.join('; '));
    }
  });
}

// ── Core files ──
assert('index.html exists', () => fileExists(path.join(ROOT, 'index.html')));
assert('reader.html exists', () => fileExists(path.join(ROOT, 'reader.html')));
assert('404.html exists', () => fileExists(path.join(ROOT, '404.html')));
assert('service worker exists', () => fileExists(path.join(ROOT, 'sw.js')));
assert('guides.json exists and is valid', () => {
  fileExists(path.join(ROOT, 'guides.json'));
  const guides = JSON.parse(fs.readFileSync(path.join(ROOT, 'guides.json'), 'utf8'));
  if (!Array.isArray(guides) || guides.length === 0) throw new Error('guides.json must be a non-empty array');
  for (const g of guides) {
    if (typeof g.slug !== 'string' || !g.slug) throw new Error('guide missing slug');
    if (typeof g.title !== 'string' || !g.title) throw new Error('guide missing title');
    if (typeof g.path !== 'string' || !g.path) throw new Error('guide missing path');
  }
  return guides;
});
assert('CNAME exists', () => fileExists(path.join(ROOT, 'CNAME')));
assert('CNAME contains gamemds.org', () => {
  const cname = fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim();
  if (cname !== 'gamemds.org') throw new Error('expected gamemds.org, got ' + cname);
});
assert('.nojekyll exists', () => fileExists(path.join(ROOT, '.nojekyll')));

// ── Assets ──
const requiredAssets = [
  'assets/css/index.css',
  'assets/css/reader.css',
  'assets/js/index.js',
  'assets/js/reader.js',
  'assets/fonts/final_fantasy_36_font.woff',
  'assets/fonts/final_fantasy_36_font.ttf',
  'marked.js'
];
for (const asset of requiredAssets) {
  assert('asset exists: ' + asset, () => fileExists(path.join(ROOT, asset)));
}

// ── All guides from guides.json ──
const guidesList = JSON.parse(fs.readFileSync(path.join(ROOT, 'guides.json'), 'utf8'));
for (const g of guidesList) {
  validateGuide(g.path, g.path);
}

// ── HTML asset references ──
assert('index.html references required external assets', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!html.includes('assets/css/index.css')) throw new Error('missing index.css link');
  if (!html.includes('assets/js/index.js')) throw new Error('missing index.js script');
  if (!html.includes('id="guide-list"')) throw new Error('missing guide-list container');
  if (!html.includes('Content-Security-Policy')) throw new Error('missing CSP');
});

assert('reader.html references required external assets', () => {
  const html = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  if (!html.includes('assets/css/reader.css')) throw new Error('missing reader.css link');
  if (!html.includes('assets/js/reader.js')) throw new Error('missing reader.js script');
  if (!html.includes('Content-Security-Policy')) throw new Error('missing CSP');
  if (!html.includes('id="guide-header"')) throw new Error('missing guide-header placeholder');
});

// ── Summary ──
console.log('');
console.log('  \x1b[32mPassed:\x1b[0m ' + passed);
if (failed > 0) {
  console.log('  \x1b[31mFailed:\x1b[0m ' + failed);
  failures.forEach(f => console.log('    ' + f));
  process.exit(1);
} else {
  console.log('  \x1b[32mAll ' + passed + ' validations passed.\x1b[0m');
  process.exit(0);
}
