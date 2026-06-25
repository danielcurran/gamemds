(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed', err));
  }

  const EINK_KEY = 'gamemds-eink-mode';

  function loadEink() {
    try { return localStorage.getItem(EINK_KEY) === '1'; } catch { return false; }
  }

  function saveEink(on) {
    try { localStorage.setItem(EINK_KEY, on ? '1' : '0'); } catch {}
  }

  function applyEink() {
    const on = loadEink();
    const toggle = document.getElementById('eink-toggle');
    if (on) {
      document.body.classList.add('eink-mode');
      if (toggle) toggle.textContent = '🌙';
    } else {
      document.body.classList.remove('eink-mode');
      if (toggle) toggle.textContent = '☀️';
    }
  }

  applyEink();

  const toggle = document.getElementById('eink-toggle');
  if (toggle) {
    toggle.addEventListener('click', e => {
      e.preventDefault();
      const on = !document.body.classList.contains('eink-mode');
      if (on) {
        document.body.classList.add('eink-mode');
        toggle.textContent = '🌙';
      } else {
        document.body.classList.remove('eink-mode');
        toggle.textContent = '☀️';
      }
      saveEink(on);
    });
  }

  const list = document.getElementById('guide-list');
  if (!list) return;

  let guides = [];
  try {
    const res = await fetch('guides.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    guides = await res.json();
  } catch (err) {
    console.warn('faqmd: failed to load guides.json', err.message);
  }

  if (!Array.isArray(guides) || guides.length === 0) {
    list.innerHTML = '<p class="guide-meta">No walkthroughs available.</p>';
    return;
  }

  async function countSections(guide) {
    try {
      const res = await fetch((guide.path || guide.slug) + '/toc.json');
      if (!res.ok) return null;
      const toc = await res.json();
      function count(nodes) {
        let n = 0;
        for (const node of nodes) {
          if (node.file) n++;
          if (node.children) n += count(node.children);
        }
        return n;
      }
      return count(toc);
    } catch {
      return null;
    }
  }

  list.innerHTML = '';
  for (const g of guides) {
    const sections = await countSections(g);
    const card = document.createElement('a');
    card.className = 'guide-card';
    card.href = 'reader.html?game=' + encodeURIComponent(g.slug);

    const title = document.createElement('span');
    title.className = 'guide-title';
    title.textContent = g.title;

    const meta = document.createElement('span');
    meta.className = 'guide-meta';
    let metaText = g.desc || g.subtitle || '';
    if (g.author) metaText += (metaText ? ' by ' : 'By ') + g.author;
    if (sections !== null) metaText += ' — ' + sections + ' sections';
    meta.textContent = metaText;

    card.appendChild(title);
    card.appendChild(meta);
    list.appendChild(card);
  }
})();
