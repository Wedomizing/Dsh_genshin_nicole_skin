/** Position only our floating player; never resize or move the host composer. */
export function positionFloatingControls(doc, controls) {
  const win = doc.defaultView;
  let disposed = false;
  let frame;
  const cards = new Set();
  const resize = win.ResizeObserver ? new win.ResizeObserver(schedule) : undefined;

  function schedule() {
    if (!disposed && frame === undefined) frame = win.requestAnimationFrame(place);
  }

  function place() {
    frame = undefined;
    if (disposed) return;
    const current = new Set(doc.querySelectorAll('[data-composer-card]'));
    for (const card of cards) {
      if (!current.has(card)) { resize?.unobserve(card); cards.delete(card); }
    }
    for (const card of current) {
      if (!cards.has(card)) { cards.add(card); resize?.observe(card); }
    }

    const player = controls.getBoundingClientRect();
    const viewport = win.visualViewport;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : win.innerHeight;
    const viewportTop = viewport?.offsetTop ?? 0;
    const bottomEdge = viewportBottom - 10;
    const topEdge = bottomEdge - player.height;
    let bottom = win.innerHeight - bottomEdge;
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (player.left < box.right + 8 && player.right > box.left - 8 &&
          topEdge < box.bottom + 8 && bottomEdge > box.top - 8) {
        // Stay on screen for very tall drafts / the on-screen keyboard.
        const top = Math.max(viewportTop + 8, box.top - 8 - player.height);
        bottom = Math.max(bottom, win.innerHeight - top - player.height);
      }
    }
    const value = `${Math.max(10, bottom)}px`;
    if (controls.style.bottom !== value) controls.style.bottom = value;
  }

  const mutations = new win.MutationObserver(records => {
    // Ignore our animation / status updates, including our own positioning.
    if (records.some(({ target }) => !controls.contains(target) &&
        !target.closest?.('[data-nicole-background]'))) schedule();
  });
  mutations.observe(doc.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-phase'],
  });
  resize?.observe(controls);
  resize?.observe(doc.documentElement);
  win.addEventListener('resize', schedule);
  doc.addEventListener('scroll', schedule, true);
  win.visualViewport?.addEventListener('resize', schedule);
  win.visualViewport?.addEventListener('scroll', schedule);
  schedule();

  return () => {
    disposed = true;
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    mutations.disconnect();
    resize?.disconnect();
    cards.clear();
    win.removeEventListener('resize', schedule);
    doc.removeEventListener('scroll', schedule, true);
    win.visualViewport?.removeEventListener('resize', schedule);
    win.visualViewport?.removeEventListener('scroll', schedule);
  };
}
