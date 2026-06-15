(async () => {
  const card = document.querySelector('.guide-card');
  if (!card) return;
  card.querySelector('.guide-title').textContent = card.dataset.title;

  try {
    const res = await fetch('guide/toc.json');
    if (!res.ok) return;
    const toc = await res.json();
    function countSections(nodes) {
      let n = 0;
      for (const node of nodes) {
        if (node.file) n++;
        if (node.children) n += countSections(node.children);
      }
      return n;
    }
    const sections = countSections(toc);
    card.querySelector('.guide-meta').textContent =
      card.dataset.desc + ' by ' + card.dataset.author + ' — ' + sections + ' sections';
  } catch {}
})();
