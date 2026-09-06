/** Position only our floating player; never resize or move the host composer.
 *
 * The player chooses a mode from the live geometry of composer cards:
 *  - full:     status + pause + prev/next, horizontal, resting at the corner;
 *  - compact:  status hidden so the three buttons fit the corner where the
 *              full bar would touch the composer card;
 *  - vertical: status hidden, buttons stacked. It stays at the corner when the
 *              column fits beside/above the cards and otherwise floats right-
 *              aligned eight pixels above the composer so it never covers input.
 */
export function positionFloatingControls(doc, controls) {
  const win = doc.defaultView;
  let disposed = false;
  let frame;
  const cards = new Set();
  const resize = win.ResizeObserver ? new win.ResizeObserver(schedule) : undefined;
  const modes = ['full', 'compact', 'vertical'];

  function schedule() {
    if (!disposed && frame === undefined) frame = win.requestAnimationFrame(place);
  }

  function viewportBox() {
    const viewport = win.visualViewport;
    return {
      bottom: viewport ? viewport.offsetTop + viewport.height : win.innerHeight,
      top: viewport?.offsetTop ?? 0,
    };
  }

  function overlaps(rect, box, extra = 8) {
    return rect.left < box.right + extra && rect.right > box.left - extra &&
      rect.top < box.bottom + extra && rect.bottom > box.top - extra;
  }

  /** Corner-resting box for `rect`, mirroring the CSS right/bottom anchors. */
  function cornerBox(rect) {
    const viewportBottom = viewportBox().bottom;
    const bottom = viewportBottom - 10;
    return { left: rect.left, right: rect.right, top: bottom - rect.height, bottom };
  }

  function touchesAnyCardAtCorner(rect) {
    const candidate = cornerBox(rect);
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (overlaps(candidate, box)) return true;
    }
    return false;
  }

  function measure(mode) {
    // Mode changes the size (status visibility / stacking); reading the box
    // after the attribute change forces the style to apply synchronously.
    controls.dataset.nicoleMode = mode;
    const rect = controls.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
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

    // Pick the least intrusive mode that can rest at the corner untouched.
    let mode = 'full';
    let rect;
    for (const candidate of modes) {
      rect = measure(candidate);
      mode = candidate;
      if (!touchesAnyCardAtCorner(rect)) break;
    }
    // When even the vertical column collides, keep it vertical and lift it
    // above the composer below.

    const { bottom: viewportBottom, top: viewportTop } = viewportBox();
    const bottomEdge = viewportBottom - 10;
    const topEdge = bottomEdge - rect.height;
    let bottom = win.innerHeight - bottomEdge;
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      // Stay on screen for very tall drafts / the on-screen keyboard.
      if (overlaps({ left: rect.left, right: rect.right, top: topEdge, bottom: bottomEdge }, box)) {
        const top = Math.max(viewportTop + 8, box.top - 8 - rect.height);
        bottom = Math.max(bottom, win.innerHeight - top - rect.height);
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
    win.visualViewport?.removeEventListener('scroll', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
  };
}
