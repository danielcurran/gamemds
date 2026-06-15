#!/usr/bin/env node
// Validation suite for the gamemds static site.
// Usage: node scripts/validate.js

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const GUIDE_DIR = path.join(ROOT, 'guide');

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

// ── Core files ──
assert('index.html exists', () => fileExists(path.join(ROOT, 'index.html')));
assert('reader.html exists', () => fileExists(path.join(ROOT, 'reader.html')));
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

// ── guide/toc.json ──
let tocData;
assert('guide/toc.json exists and is valid JSON', () => {
  fileExists(path.join(GUIDE_DIR, 'toc.json'));
  tocData = JSON.parse(fs.readFileSync(path.join(GUIDE_DIR, 'toc.json'), 'utf8'));
  if (!Array.isArray(tocData) || tocData.length === 0) throw new Error('toc.json must be a non-empty array');
});

let tocFiles;
let flatToc;
assert('toc.json nodes have required fields', () => {
  flatToc = flattenToc(tocData);
  for (const n of flatToc) {
    if (typeof n.num !== 'string' || !n.num) throw new Error('missing num: ' + JSON.stringify(n));
    if (typeof n.title !== 'string' || !n.title) throw new Error('missing title: ' + JSON.stringify(n));
    if (typeof n.depth !== 'number') throw new Error('missing depth: ' + JSON.stringify(n));
    if (!Array.isArray(n.children)) throw new Error('missing children array: ' + JSON.stringify(n));
  }
});

assert('every toc.json file exists in guide/', () => {
  tocFiles = collectTocFiles(tocData);
  for (const f of tocFiles) {
    fileExists(path.join(GUIDE_DIR, f));
  }
});

assert('every guide .md file is referenced in toc.json', () => {
  const mdFiles = fs.readdirSync(GUIDE_DIR)
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

assert('toc.json section numbers are unique', () => {
  const nums = new Set();
  for (const n of flatToc) {
    if (nums.has(n.num)) throw new Error('duplicate section number: ' + n.num);
    nums.add(n.num);
  }
});

// ── guide/index.md ──
assert('guide/index.md exists', () => fileExists(path.join(GUIDE_DIR, 'index.md')));

assert('guide/index.md links point to existing files', () => {
  const indexMd = fs.readFileSync(path.join(GUIDE_DIR, 'index.md'), 'utf8');
  const linkRe = /\]\(([^)]+\.md)\)/g;
  let m;
  while ((m = linkRe.exec(indexMd)) !== null) {
    const target = m[1];
    fileExists(path.join(GUIDE_DIR, target));
  }
});

// ── HTML asset references ──
assert('index.html references required external assets', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!html.includes('assets/css/index.css')) throw new Error('missing index.css link');
  if (!html.includes('assets/js/index.js')) throw new Error('missing index.js script');
  if (!html.includes('Content-Security-Policy')) throw new Error('missing CSP');
});

assert('reader.html references required external assets', () => {
  const html = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  if (!html.includes('assets/css/reader.css')) throw new Error('missing reader.css link');
  if (!html.includes('assets/js/reader.js')) throw new Error('missing reader.js script');
  if (!html.includes('Content-Security-Policy')) throw new Error('missing CSP');
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
