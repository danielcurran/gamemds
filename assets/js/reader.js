import { marked } from '../../marked.js';

// Strip raw HTML from section markdown before inserting into the DOM.
marked.use({ renderer: { html: () => '' } });

const $ = id => document.getElementById(id);
let guides = [], activeGuide = null, guideBase = 'guide';
let tocData = [], flatSections = [], currentIdx = -1, sidebarOpen = false;
let guideMeta = {};

function toggleSidebar() { sidebarOpen = !sidebarOpen; $('sidebar').classList.toggle('show', sidebarOpen); }

function getQueryParam(name) {
  const params = new URLSearchParams(location.search);
  return params.get(name);
}

async function loadGuides() {
  try {
    const res = await fetch('guides.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    guides = await res.json();
  } catch (err) {
    console.warn('faqmd: failed to load guides.json', err.message);
    guides = [];
  }
  if (!Array.isArray(guides) || guides.length === 0) {
    // Legacy fallback: single guide in guide/
    guides = [{ slug: 'default', title: 'Guide', path: 'guide' }];
  }

  const requested = getQueryParam('game');
  activeGuide = guides.find(g => g.slug === requested) || guides[0];
  guideBase = activeGuide.path || activeGuide.slug;
}

async function loadMeta() {
  try {
    const res = await fetch(guideBase + '/meta.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    guideMeta = await res.json();
  } catch (err) {
    console.warn('faqmd: failed to load ' + guideBase + '/meta.json', err.message);
    guideMeta = {
      title: activeGuide.title || 'Guide',
      subtitle: activeGuide.subtitle || 'Walkthrough',
      author: activeGuide.author || 'Unknown Author',
      attributionHtml: 'Converted with <a href="https://github.com/danielcurran/faqmd" target="_blank" rel="noopener">faqmd</a>'
    };
  }
  document.title = guideMeta.title
    ? guideMeta.title + (guideMeta.subtitle ? ' — ' + guideMeta.subtitle : '')
    : document.title;
  const headerText = guideMeta.title
    ? (guideMeta.title + (guideMeta.subtitle ? ' ' + guideMeta.subtitle : ''))
    : 'Guide & Walkthrough';
  $('guide-header').textContent = headerText;
  if (guideMeta.attributionHtml) {
    $('guide-attribution').innerHTML = guideMeta.attributionHtml;
  }
}

async function loadToc() {
  try {
    const res = await fetch(guideBase + '/toc.json');
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    tocData = await res.json();
  } catch (err) {
    console.warn('faqmd: failed to load TOC', err.message);
    const msg = err.message.includes('fetch') || err.message.includes('NetworkError')
      ? 'Network error — check your connection.'
      : err.message.includes('returned')
        ? 'Server error — the guide may be temporarily unavailable.'
        : err.message;
    $('content').innerHTML = `<p style="color:var(--ff-muted);text-align:center;padding:60px">Failed to load guide.</p><p style="color:var(--ff-muted);text-align:center;font-size:0.85rem">${msg}</p>`;
    return;
  }
  function flatten(nodes, depth) {
    for (const n of nodes) {
      flatSections.push({...n, depth});
      if (n.children) flatten(n.children, depth+1);
    }
  }
  flatten(tocData, 0);
  renderToc(tocData);
  const hash = location.hash.slice(1);
  const idx = hash ? flatSections.findIndex(s => s.num === hash) : -1;
  loadSection(idx >= 0 ? idx : 0);
}

function renderToc(nodes) {
  if (!nodes || nodes.length === 0) {
    $('toc').innerHTML = '<p style="padding:20px;color:var(--ff-muted);font-size:0.85rem;text-align:center">Guide not available.</p>';
    return;
  }
  $('toc').innerHTML = buildTocHtml(nodes);
}

function buildTocHtml(nodes) {
  return nodes.map(n => {
    const cls = n.file ? 'toc-item' : 'toc-item toc-folder';
    return `<div class="${cls} toc-d${n.depth}" data-num="${n.num}" data-file="${n.file||''}">${n.num}. ${n.title}</div>` +
      (n.children ? buildTocHtml(n.children) : '');
  }).join('');
}

$('toc').addEventListener('click', e => {
  const item = e.target.closest('.toc-item');
  if (!item || !item.dataset.file) return;
  if (sidebarOpen) toggleSidebar();
  loadByNum(item.dataset.num);
});

async function loadSection(idx) {
  if (idx < 0 || idx >= flatSections.length) return;
  currentIdx = idx;
  const s = flatSections[idx];
  if (!s.file) return;
  $('content').innerHTML = '<div id="loading">Loading...</div>';
  try {
    const res = await fetch(guideBase + '/' + s.file);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let md = await res.text();
    $('content').innerHTML = await marked.parse(md);
    detectArtBlocks();
    updateNav();
    highlightToc(s.num);
    $('content').scrollTop = 0;
    location.hash = '#' + s.num;
  } catch(e) {
    console.warn('faqmd: failed to load section', s?.file, e.message);
    const msg = e.message.includes('fetch') ? 'Network error — check your connection.'
      : e.message.includes('404') ? 'Section file not found.'
      : e.message;
    $('content').innerHTML = `<p style="color:var(--ff-muted);text-align:center;padding:60px">Error loading section.</p><p style="color:var(--ff-muted);text-align:center;font-size:0.85rem">${msg}</p>`;
  }
}

function loadByNum(num) {
  const s = flatSections.find(s => s.num === num);
  if (s && s.file) loadSection(flatSections.indexOf(s));
}

function isAsciiArtBlock(el) {
  const text = el.textContent;
  const lines = text.split('\n');
  let artLines = 0;
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    // 3+ pipe chars (table)
    if ((s.match(/\|/g) || []).length >= 3) { artLines++; continue; }
    // Repeated decorative chars
    if (/^[\*\-_=¯]{8,}$/.test(s)) { artLines++; continue; }
    // Box-drawing patterns
    if ((s.match(/[\/\\\|]/g) || []).length >= 5) { artLines++; continue; }
    // Lines where special chars heavily outnumber letters
    const letters = (s.match(/[a-zA-Z]/g) || []).length;
    const special = (s.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (special > letters * 2 && special > 3) artLines++;
  }
  return artLines >= 2;
}

function detectArtBlocks() {
  document.querySelectorAll('#content pre').forEach(el => {
    if (isAsciiArtBlock(el)) el.classList.add('keep-scroll');
  });
}

function goPrev() { if (currentIdx > 0) loadSection(currentIdx - 1); }
function goNext() {
  for (let i = currentIdx + 1; i < flatSections.length; i++) {
    if (flatSections[i].file) { loadSection(i); return; }
  }
}

function updateNav() {
  const s = flatSections[currentIdx];
  let pi = currentIdx - 1; while (pi >= 0 && !flatSections[pi].file) pi--;
  let ni = currentIdx + 1; while (ni < flatSections.length && !flatSections[ni].file) ni++;
  $('prev-btn').disabled = pi < 0; $('prev-btn2').disabled = pi < 0;
  $('next-btn').disabled = ni >= flatSections.length; $('next-btn2').disabled = ni >= flatSections.length;
  const parts = s.num.split('.');
  let crumb = '';
  for (let i = 1; i <= parts.length; i++) {
    const pn = parts.slice(0,i).join('.');
    const ps = flatSections.find(x => x.num === pn);
    if (ps && ps.num !== s.num) crumb += `<a href="#${ps.num}" data-num="${ps.num}">${ps.num}. ${ps.title}</a> › `;
  }
  crumb += `<span>${s.num}. ${s.title}</span>`;
  $('breadcrumb').innerHTML = crumb;
}

function highlightToc(num) {
  document.querySelectorAll('.toc-item').forEach(el => el.classList.toggle('active', el.dataset.num === num));
}

$('search-input').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('.toc-item').forEach(el => {
    el.classList.toggle('hidden', q && !el.textContent.toLowerCase().includes(q));
  });
});

$('menu-btn').addEventListener('click', e => {
  e.stopPropagation();
  toggleSidebar();
});

$('main').addEventListener('click', e => {
  if (sidebarOpen && !e.target.closest('#sidebar') && !e.target.closest('#menu-btn')) toggleSidebar();
});
$('prev-btn').addEventListener('click', goPrev);
$('next-btn').addEventListener('click', goNext);
$('prev-btn2').addEventListener('click', goPrev);
$('next-btn2').addEventListener('click', goNext);

$('breadcrumb').addEventListener('click', e => {
  const a = e.target.closest('a');
  if (a && a.dataset.num) { e.preventDefault(); loadByNum(a.dataset.num); }
});

document.addEventListener('keydown', e => {
  if (e.target.closest('input')) return;
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'ArrowRight') goNext();
});

$('content').addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('#')) return;
  if (href.endsWith('.md')) {
    e.preventDefault();
    const file = href.replace(/^.*\//, '');
    const s = flatSections.find(s => s.file === file);
    if (s) loadByNum(s.num);
  }
});

loadGuides().then(() => loadMeta()).then(() => loadToc());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed', err));
}
