import { marked } from '../../marked.js';

// Strip raw HTML from section markdown before inserting into the DOM.
marked.use({ renderer: { html: () => '' } });

const $ = id => document.getElementById(id);
let guides = [], activeGuide = null, guideBase = 'guides/phantasy-star-iv';
let tocData = [], flatSections = [], currentIdx = -1, sidebarOpen = false;
let guideMeta = {};

let achievements = null;
let achievementMap = {};
let missableCutoffs = {};
let achievementProgress = {};
let achievementFilter = 'all';
let achievementPanelOpen = false;
let lastFocusedEl = null;

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
    // Legacy fallback: first guide in guides/
    guides = [{ slug: 'default', title: 'Guide', path: 'guides/phantasy-star-iv' }];
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
      attributionHtml: ''
    };
  }
  document.title = guideMeta.title
    ? guideMeta.title + (guideMeta.subtitle ? ' — ' + guideMeta.subtitle : '')
    : document.title;
  const headerText = guideMeta.title
    ? (guideMeta.title + (guideMeta.subtitle ? ' ' + guideMeta.subtitle : ''))
    : 'Guide & Walkthrough';
  $('guide-header').textContent = headerText;

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

async function loadAchievements() {
  if (!activeGuide.hasAchievements) return;
  try {
    const res = await fetch(guideBase + '/achievements.json');
    if (!res.ok) return;
    achievements = await res.json();
    achievementMap = buildAchievementMap(achievements);
    missableCutoffs = buildMissableCutoffs(achievements);
    achievementProgress = loadProgress(achievements.gameId);
    renderAchievementSidebar();
  } catch { /* achievements.json is optional */ }
}

function buildAchievementMap(ach) {
  const map = {};
  for (const a of ach.achievements) {
    if (!map[a.section]) map[a.section] = [];
    map[a.section].push(a);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => b.points - a.points || a.title.localeCompare(b.title));
  }
  return map;
}

function buildMissableCutoffs(ach) {
  const cutoffs = {};
  for (const a of ach.achievements) {
    if (a.missable && a.missableCutoffSection) {
      if (!cutoffs[a.missableCutoffSection]) cutoffs[a.missableCutoffSection] = [];
      cutoffs[a.missableCutoffSection].push(a);
    }
  }
  return cutoffs;
}

function renderAchievements(sectionNum) {
  const achs = achievementMap[sectionNum];
  if (!achs || achs.length === 0) return '';
  return '<div class="achievement-badges">' + achs.map(a => {
    const checked = achievementProgress[a.id] ? ' checked' : '';
    const medal = a.points >= 25 ? '🏅' : a.points >= 10 ? '🥈' : '🥉';
    let hintsHtml = '';
    if (a.communityTips && a.communityTips.length > 0) {
      const first = a.communityTips[0];
      const moreCount = a.communityTips.length - 1;
      hintsHtml = `<div class="achievement-hint">💬 "${escHtml(first.text)}" — ${escHtml(first.user)}` +
        (moreCount > 0 ? ` <span class="achievement-hint-more">${moreCount} more ▼</span>` : '') + '</div>' +
        '<div class="achievement-hint-expanded">' +
        a.communityTips.map(t => `<div class="achievement-tip">💬 "${escHtml(t.text)}" — ${escHtml(t.user)}</div>`).join('') +
        '</div>';
    }
    return `<div class="achievement-badge${a.missable ? ' missable' : ''}" data-id="${a.id}">
      <img src="${a.badgeUrl}" alt="${medal}" class="achievement-icon" loading="lazy">
      <div class="achievement-info">
        <strong>${a.title}</strong> — ${a.description}
        <span class="achievement-points">${a.points} pts</span>${a.missable ? '<span class="achievement-missable">⚠️ Missable</span>' : ''}
      </div>
      <input type="checkbox" class="achievement-check" data-id="${a.id}"${checked}>
    </div>${hintsHtml}`;
  }).join('') + '</div>';
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initAchievementModal() {
  if ($('achievement-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'achievement-modal';
  modal.className = 'ach-modal-overlay';
  modal.innerHTML = `
    <div class="ach-modal-backdrop"></div>
    <div class="ach-modal-dialog">
      <button class="ach-modal-close" aria-label="Close">&times;</button>
      <div class="ach-modal-body" id="ach-modal-body"></div>
    </div>
  `;
  modal.addEventListener('click', e => {
    if (e.target.classList.contains('ach-modal-backdrop') || e.target.classList.contains('ach-modal-close')) {
      closeAchievementModal();
    }
  });
  document.body.appendChild(modal);
  if (!document.body.classList.contains('modal-open-ready')) {
    document.body.classList.add('modal-open-ready');
  }
}

function openAchievementModal(id) {
  if (!achievements) return;
  const a = achievements.achievements.find(x => x.id === id);
  if (!a) return;
  lastFocusedEl = document.activeElement;

  const medal = a.points >= 25 ? '🏅' : a.points >= 10 ? '🥈' : '🥉';
  const checked = achievementProgress[a.id] ? ' checked' : '';
  const typeClass = 'ach-type-' + (a.type || 'progress');
  const typeLabel = a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1) : 'Progress';

  let missableHtml = '';
  if (a.missable) {
    missableHtml = `<div class="ach-modal-missable">⚠️ Missable` +
      (a.missableCutoff ? ` — becomes unavailable after: ${escHtml(a.missableCutoff)}` : '') +
      (a.missableCutoffSection ? ` <a href="#${a.missableCutoffSection}" data-num="${a.missableCutoffSection}">§${a.missableCutoffSection}</a>` : '') +
      '</div>';
  }

  let notesHtml = '';
  if (a.notes) {
    notesHtml = `<div class="ach-modal-notes"><strong>Strategy:</strong> ${escHtml(a.notes)}</div>`;
  }

  let tipsHtml = '';
  if (a.communityTips && a.communityTips.length > 0) {
    tipsHtml = `<div class="ach-modal-tips">
      <div class="ach-modal-tips-title">Community Tips (${a.communityTips.length})</div>
      ${a.communityTips.map(t => `<div class="ach-modal-tip">💬 "${escHtml(t.text)}" <span class="ach-modal-tip-user">— ${escHtml(t.user)}</span></div>`).join('')}
    </div>`;
  }

  let sectionHtml = '';
  if (a.section) {
    const sec = flatSections.find(s => s.num === a.section);
    const secTitle = sec ? sec.title : a.section;
    sectionHtml = `<div class="ach-modal-section">
      <a href="#${a.section}" data-num="${a.section}" class="ach-modal-section-link">📖 §${a.section} ${secTitle}</a>
    </div>`;
  }

  const ongoingTag = a.ongoing ? ' 🔓 Ongoing' : '';

  $('ach-modal-body').innerHTML = `
    <div class="ach-modal-header">
      <img src="${a.badgeUrl}" alt="${medal}" class="ach-modal-icon" loading="lazy" onerror="this.replaceWith(document.createElement('span'))">
      <div class="ach-modal-header-text">
        <div class="ach-modal-title">${escHtml(a.title)}${ongoingTag}</div>
        <div class="ach-modal-meta">
          <span class="ach-modal-points">${medal} ${a.points} pts</span>
          <span class="ach-modal-type ${typeClass}">${typeLabel}</span>
        </div>
      </div>
    </div>
    <div class="ach-modal-description">${escHtml(a.description)}</div>
    ${missableHtml}
    ${notesHtml}
    ${tipsHtml}
    ${sectionHtml}
    <div class="ach-modal-actions">
      <label class="ach-modal-check-label">
        <input type="checkbox" class="achievement-check ach-modal-check" data-id="${a.id}"${checked}>
        <span>Mark as earned</span>
      </label>
    </div>
  `;

  const overlay = $('achievement-modal');
  overlay.classList.add('open');
  document.body.classList.add('ach-modal-scroll-lock');

  const modalCheck = overlay.querySelector('.ach-modal-check');
  if (modalCheck) {
    modalCheck.addEventListener('change', () => {
      achievementProgress[a.id] = modalCheck.checked;
      saveProgress(achievements.gameId, achievementProgress);
      updateAchievementSidebar();
      const inlineChecks = document.querySelectorAll(`.achievement-check[data-id="${a.id}"]`);
      inlineChecks.forEach(cb => { cb.checked = modalCheck.checked; });
    });
  }
  const closeBtn = overlay.querySelector('.ach-modal-close');
  if (closeBtn) closeBtn.focus();
}

function closeAchievementModal() {
  const overlay = $('achievement-modal');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('ach-modal-scroll-lock');
  if (lastFocusedEl) {
    lastFocusedEl.focus();
    lastFocusedEl = null;
  }
}

function renderMissableWarning(sectionNum) {
  const cutoffs = missableCutoffs[sectionNum];
  if (!cutoffs || cutoffs.length === 0) return '';
  const names = cutoffs.map(a => a.title).join(', ');
  return `<div class="missable-warning">⚠️ <strong>${cutoffs.length} missable achievement${cutoffs.length > 1 ? 's' : ''}</strong> become${cutoffs.length === 1 ? 's' : ''} unavailable after this section: ${names}</div>`;
}

function renderUpcomingMissables(sectionNum) {
  if (!achievements) return '';
  const currentIdx = flatSections.findIndex(s => s.num === sectionNum);
  if (currentIdx < 0) return '';
  const upcoming = [];
  for (let i = currentIdx + 1; i <= currentIdx + 2 && i < flatSections.length; i++) {
    const nextSection = flatSections[i];
    const cutoffs = missableCutoffs[nextSection.num];
    if (cutoffs) {
      for (const a of cutoffs) {
        upcoming.push({ title: a.title, cutoff: nextSection.num, cutoffTitle: nextSection.title });
      }
    }
  }
  if (upcoming.length === 0) return '';
  const items = upcoming.map(u =>
    `${u.title} — after <a href="#${u.cutoff}" data-num="${u.cutoff}">${u.cutoff} ${u.cutoffTitle}</a>`
  ).join('<br>');
  return `<div class="upcoming-missable">💡 <strong>Heads up</strong> — missable achievement${upcoming.length > 1 ? 's' : ''} coming up:<br>${items}</div>`;
}

function loadProgress(gameId) {
  try {
    return JSON.parse(localStorage.getItem(`ra-progress-${gameId}`)) || {};
  } catch { return {}; }
}

function saveProgress(gameId, progress) {
  localStorage.setItem(`ra-progress-${gameId}`, JSON.stringify(progress));
}

function wireAchievementHints() {
  document.querySelectorAll('.achievement-hint-more').forEach(el => {
    el.addEventListener('click', () => {
      const container = el.closest('.achievement-badges');
      const hint = el.closest('.achievement-hint');
      if (!hint) return;
      const expanded = hint.nextElementSibling;
      if (!expanded || !expanded.classList.contains('achievement-hint-expanded')) return;
      const isOpen = expanded.classList.toggle('open');
      el.textContent = (parseInt(el.textContent) || 0) + ' more ' + (isOpen ? '▲' : '▼');
    });
  });
}

function enhanceChecklistPage() {
  if (!achievements) return;
  const buildTitleMap = () => {
    const map = {};
    for (const a of achievements.achievements) {
      map[a.title.toLowerCase()] = a.id;
    }
    return map;
  };
  const titleMap = buildTitleMap();
  const aById = {};
  for (const a of achievements.achievements) {
    aById[a.id] = a;
  }
  const content = $('content');
  const listItems = content.querySelectorAll('li');
  listItems.forEach(li => {
    const text = li.textContent || '';
    const mdTitleMatch = text.match(/\*\*([^*]+)\*\*/);
    if (!mdTitleMatch) return;
    const title = mdTitleMatch[1].trim();
    const id = titleMap[title.toLowerCase()];
    if (id === undefined) return;
    const checked = !!achievementProgress[id];
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'achievement-check';
    checkbox.dataset.id = id;
    checkbox.checked = checked;
    checkbox.addEventListener('change', () => {
      achievementProgress[id] = checkbox.checked;
      saveProgress(achievements.gameId, achievementProgress);
      updateAchievementSidebar();
      li.classList.toggle('achievement-earned', checkbox.checked);
    });
    li.insertBefore(checkbox, li.firstChild);
    li.classList.toggle('achievement-earned', checked);

    const ach = aById[id];
    if (ach && ach.communityTips && ach.communityTips.length > 0) {
      const icon = document.createElement('span');
      icon.className = 'achievement-hint-icon';
      icon.textContent = '💬';
      icon.title = ach.communityTips.length + ' player tip' + (ach.communityTips.length > 1 ? 's' : '');
      const hintExpanded = document.createElement('div');
      hintExpanded.className = 'achievement-hint-expanded checklist-tip';
      hintExpanded.innerHTML = ach.communityTips.map(t =>
        '<div class="achievement-tip">💬 "' + escHtml(t.text) + '" — ' + escHtml(t.user) + '</div>'
      ).join('');
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        hintExpanded.classList.toggle('open');
        icon.textContent = hintExpanded.classList.contains('open') ? '💬▲' : '💬';
      });
      li.appendChild(icon);
      li.parentNode.insertBefore(hintExpanded, li.nextSibling);
    }
  });
  const missableTable = content.querySelector('table');
  if (missableTable) {
    const rows = missableTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const firstCell = row.querySelector('td:first-child');
      if (!firstCell) return;
      const cellText = firstCell.textContent || '';
      for (const a of achievements.achievements) {
        if (cellText.includes(a.title)) {
          if (achievementProgress[a.id]) row.classList.add('achievement-earned');
          break;
        }
      }
    });
  }
}

function bindAchievementCheckboxes() {
  document.querySelectorAll('.achievement-check').forEach(cb => {
    const id = parseInt(cb.dataset.id);
    cb.checked = !!achievementProgress[id];
    cb.addEventListener('change', () => {
      achievementProgress[id] = cb.checked;
      saveProgress(achievements.gameId, achievementProgress);
      updateAchievementSidebar();
    });
  });
}

function bindAchievementImages() {
  document.querySelectorAll('.achievement-icon').forEach(img => {
    img.addEventListener('error', () => {
      const medal = img.getAttribute('alt') || '🏅';
      const wrapper = document.createElement('span');
      wrapper.className = 'achievement-medal-fallback';
      wrapper.textContent = medal;
      img.replaceWith(wrapper);
    });
  });
}

function renderAchievementSidebar() {
  if (!achievements) return;
  const total = achievements.totalAchievements;
  const earned = Object.values(achievementProgress).filter(Boolean).length;
  const points = achievements.totalPoints;
  const earnedPts = achievements.achievements
    .filter(a => achievementProgress[a.id])
    .reduce((sum, a) => sum + a.points, 0);
  const pct = total ? Math.round((earned / total) * 100) : 0;

  const types = ['all', 'missable', 'story', 'challenge', 'secret', 'progress', 'collectible'];
  const typeLabels = { all: 'All', missable: 'Miss', story: 'Story', challenge: 'Chal', secret: 'Sec', progress: 'Prog', collectible: 'Col' };

  const filterBtns = types.map(t => {
    const active = achievementFilter === t ? ' class="ach-filter-active"' : '';
    return `<button data-filter="${t}"${active}>${typeLabels[t]}</button>`;
  }).join('');

  let filteredAchievements = achievements.achievements;
  if (achievementFilter !== 'all') {
    filteredAchievements = achievementFilter === 'missable'
      ? achievements.achievements.filter(a => a.missable)
      : achievements.achievements.filter(a => a.type === achievementFilter);
  }

  const medal = pts => pts >= 25 ? '🏅' : pts >= 10 ? '🥈' : '🥉';
  const achList = filteredAchievements.slice(0, 30).map(a => {
    const checked = achievementProgress[a.id] ? ' checked' : '';
    const missableTag = a.missable ? ' ⚠️' : '';
    return `<div class="ach-mini-item${checked ? ' earned' : ''}" data-num="${a.section}" data-id="${a.id}">
      <input type="checkbox" class="ach-mini-check" data-id="${a.id}"${checked}>
      <span class="ach-mini-title">${medal(a.points)} ${a.title}${missableTag}</span>
    </div>`;
  }).join('');

  const remaining = total - earned;
  const progressLabel = earned > 0
    ? `${earned}/${total} · ${earnedPts}/${points} pts · ${remaining} left`
    : `${total} achievements · ${points} pts`;

  const existing = $('achievement-sidebar');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'achievement-sidebar' + (achievementPanelOpen ? ' open' : '');
  el.id = 'achievement-sidebar';
  el.innerHTML = `
    <div class="ach-counter" id="ach-counter">🏅 ${progressLabel}</div>
    <div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${pct}%"></div></div>
    <div class="ach-filters">${filterBtns}</div>
    <div class="ach-mini-list">${achList}</div>
    <div class="ach-checklist-link"><a href="#0.1" data-num="0.1">View Full Checklist</a></div>
  `;

  const toc = $('toc');
  toc.parentNode.insertBefore(el, toc.nextSibling);

  el.querySelector('#ach-counter').addEventListener('click', () => {
    achievementPanelOpen = !achievementPanelOpen;
    el.classList.toggle('open', achievementPanelOpen);
  });

  el.querySelector('.ach-filters').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    achievementFilter = btn.dataset.filter;
    renderAchievementSidebar();
  });

  el.querySelectorAll('.ach-mini-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('input')) return;
      const num = item.dataset.num;
      if (num) loadByNum(num);
      if (sidebarOpen) toggleSidebar();
    });
  });

  el.querySelectorAll('.ach-mini-check').forEach(cb => {
    const id = parseInt(cb.dataset.id);
    cb.addEventListener('change', () => {
      achievementProgress[id] = cb.checked;
      saveProgress(achievements.gameId, achievementProgress);
      renderAchievementSidebar();
    });
  });

  el.querySelector('.ach-checklist-link a').addEventListener('click', e => {
    e.preventDefault();
    loadByNum('0.1');
  });
}

function updateAchievementSidebar() {
  if (!achievements) return;
  const total = achievements.totalAchievements;
  const earned = Object.values(achievementProgress).filter(Boolean).length;
  const points = achievements.totalPoints;
  const earnedPts = achievements.achievements
    .filter(a => achievementProgress[a.id])
    .reduce((sum, a) => sum + a.points, 0);
  const pct = total ? Math.round((earned / total) * 100) : 0;
  const remaining = total - earned;
  const counter = document.querySelector('#ach-counter');
  if (counter) {
    counter.textContent = earned > 0
      ? `🏅 ${earned}/${total} · ${earnedPts}/${points} pts · ${remaining} left`
      : `🏅 ${total} achievements · ${points} pts`;
  }
  const fill = document.querySelector('.ach-progress-fill');
  if (fill) fill.style.width = pct + '%';
  document.querySelectorAll('.ach-mini-check').forEach(cb => {
    const id = parseInt(cb.dataset.id);
    cb.checked = !!achievementProgress[id];
  });
  document.querySelectorAll('.ach-mini-item').forEach(item => {
    const id = parseInt(item.dataset.id);
    item.classList.toggle('earned', !!achievementProgress[id]);
  });
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
    let html = await marked.parse(md);
    const achHtml = renderAchievements(s.num);
    const warnHtml = renderMissableWarning(s.num);
    const upcomingHtml = renderUpcomingMissables(s.num);
    if (achHtml || warnHtml || upcomingHtml) {
      html = warnHtml + upcomingHtml + achHtml + html;
    }
    $('content').innerHTML = html;
    bindAchievementCheckboxes();
    bindAchievementImages();
    wireAchievementHints();
    if (s.file === 'achievements.md') enhanceChecklistPage();
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
  if (e.key === 'Escape') {
    const modal = $('achievement-modal');
    if (modal && modal.classList.contains('open')) {
      closeAchievementModal();
      return;
    }
  }
  if (e.target.closest('input')) return;
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'ArrowRight') goNext();
});

$('content').addEventListener('click', e => {
  // Achievement badge click -> open modal (ignore checkbox clicks)
  const badge = e.target.closest('.achievement-badge');
  if (badge && !e.target.closest('.achievement-check') && !e.target.closest('.achievement-hint-more')) {
    const id = parseInt(badge.dataset.id);
    if (id) {
      initAchievementModal();
      openAchievementModal(id);
    }
    return;
  }

  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('#')) {
    // Internal section links within the modal
    if (href && href.startsWith('#') && a.dataset.num) {
      e.preventDefault();
      closeAchievementModal();
      loadByNum(a.dataset.num);
    }
    return;
  }
  if (href.endsWith('.md')) {
    e.preventDefault();
    const file = href.replace(/^.*\//, '');
    const s = flatSections.find(s => s.file === file);
    if (s) loadByNum(s.num);
  }
});

loadGuides().then(() => loadMeta()).then(() => loadToc()).then(() => loadAchievements());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed', err));
}
