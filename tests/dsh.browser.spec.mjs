import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

test.beforeEach(async ({ page }) => {
  // A fresh DSH opens the API-key prompt asynchronously after its welcome dialog.
  // Handle it when it actually appears, rather than racing a one-time isVisible().
  for (const name of ['继续', '稍后配置']) {
    await page.addLocatorHandler(page.getByRole('button', { name, exact: true }), button => button.click());
  }
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('nicole-acceptance-initialized')) {
      localStorage.removeItem('dsh-skin-genshin-nicole.playlist.v1');
      localStorage.removeItem('dsh-skin-genshin-nicole.settings.v1');
      sessionStorage.setItem('nicole-acceptance-initialized', 'yes');
    }
  });
});

async function openSkin(page) {
  await page.goto(process.env.DSH_TEST_URL ?? './', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-phase', 'idle');
  const image = page.locator('[data-nicole-background] img').first();
  await expect(image).toBeVisible();
  await image.evaluate((img) => img.decode());
  return image;
}

// Exercise the installed host's real active-phase CSS without a model/API key.
// Only the conversation content/state is simulated; never override its layering.
async function showActiveConversationFixture(page, text) {
  await page.locator('[data-slot="conversation"] > [data-phase]').evaluate((root, text) => {
    root.dataset.phase = 'active';
    // Active DSH drops hero spacing and its heading/workspace row. Keeping them
    // would conceal collisions with the native send/stop button at the bottom.
    const seat = root.querySelector('[data-composer-seat]');
    const inputBar = seat.querySelector('[data-composer-card]').parentElement;
    for (const node of seat.querySelectorAll('[class]')) {
      for (const name of [...node.classList]) {
        if (name.endsWith('_composerHero') || name.endsWith('_hero')) node.classList.remove(name);
      }
    }
    for (const sibling of [...inputBar.parentElement.children]) {
      if (sibling !== inputBar) sibling.remove();
    }
    const scroll = root.querySelector('[data-conversation-scroll]');
    scroll.querySelector('[data-nicole-test-conversation]')?.remove();
    const content = document.createElement('article');
    content.setAttribute('data-nicole-test-conversation', '');
    content.textContent = text;
    content.style.cssText = 'flex: none; min-height: 150vh; padding: 32px;';
    scroll.prepend(content);
    scroll.scrollTop = scroll.scrollHeight;
  }, text);
  await expect(page.locator('[data-composer-seat]')).toHaveCSS('position', 'sticky');
}

for (const { theme, width, height } of [
  { theme: '浅色', width: 1909, height: 905 },
  { theme: '深色', width: 1909, height: 905 },
  { theme: '浅色', width: 1440, height: 960 },
  { theme: '深色', width: 390, height: 844 },
]) {
  test(`playback controls stay clickable above active conversation surfaces, below Settings (${theme}, ${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openSkin(page);
    if (width < 760) await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (width < 760) await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();

    const background = page.locator('[data-nicole-background]');
    const next = page.getByRole('button', { name: '下一张背景', exact: true });
    const previous = page.getByRole('button', { name: '上一张背景', exact: true });
    await page.getByRole('button', { name: '暂停背景轮播', exact: true }).click();
    await next.click();
    await expect(background).toHaveAttribute('data-phase', 'idle');
    await expect(background).toHaveAttribute('data-index', '1');

    await showActiveConversationFixture(page, '测试会话 A：已有消息。');
    // Visibility alone misses an opaque, click-intercepting composer above us.
    // A normal click (no force) must reach the button and change the image.
    await next.click({ timeout: 3000 });
    await expect(background).toHaveAttribute('data-phase', 'idle');
    await expect(background).toHaveAttribute('data-index', '2');

    const sendBox = await page.getByRole('button', { name: '发送消息', exact: true }).boundingBox();
    const controlsBox = await page.locator('[data-nicole-controls]').boundingBox();
    expect(sendBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(
      sendBox.x < controlsBox.x + controlsBox.width && sendBox.x + sendBox.width > controlsBox.x &&
      sendBox.y < controlsBox.y + controlsBox.height && sendBox.y + sendBox.height > controlsBox.y,
      'background controls must not cover the native send/stop button',
    ).toBe(false);

    await showActiveConversationFixture(page, '测试会话 B：切换后的消息。');
    await previous.click({ timeout: 3000 });
    await expect(background).toHaveAttribute('data-phase', 'idle');
    await expect(background).toHaveAttribute('data-index', '1');
    await page.getByRole('button', { name: '继续背景轮播', exact: true }).click();
    await page.getByRole('button', { name: '暂停背景轮播', exact: true }).click();

    if (width < 760) await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await next.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), 'the modal must cover the controls, not allow click-through').toBe(false);
    await page.getByRole('combobox', { name: '尼可背景切换间隔', exact: true }).selectOption('5');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (width < 760) await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
    await next.click({ timeout: 3000 });
    await expect(background).toHaveAttribute('data-phase', 'idle');
    await expect(background).toHaveAttribute('data-index', '2');
  });
}

// Catches the real DSH conversation surface hiding an otherwise loaded image.
test('the installed wallpaper is visible through the actual DSH conversation surface', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const image = await openSkin(page);
  // The native appearance choice persists on the server between acceptance runs.
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await image.evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([1920, 864]);
  await expect(page.locator('[data-slot="conversation"] > [data-phase]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const options = { animations: 'disabled', caret: 'hide', clip: { x: 1080, y: 160, width: 260, height: 210 } };
  const withWallpaper = await page.screenshot(options);
  await page.locator('[data-nicole-background]').evaluate((el) => { el.style.visibility = 'hidden'; });
  const withoutWallpaper = await page.screenshot(options);
  expect(withWallpaper.equals(withoutWallpaper), 'the actual pixels must change when the wallpaper is hidden').toBe(false);
  await page.locator('[data-nicole-background]').evaluate((el) => { el.style.removeProperty('visibility'); });
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/dsh-pv-0.3.0-light.png', animations: 'disabled', caret: 'hide' });
  expect(errors).toEqual([]);
});

test('refresh keeps the local image and the background never captures clicks', async ({ page }) => {
  await openSkin(page);
  await page.reload({ waitUntil: 'networkidle' });
  const image = page.locator('[data-nicole-background] img');
  await expect(image).toBeVisible();
  await image.evaluate((img) => img.decode());
  await expect(page.locator('[data-nicole-background]')).toHaveCSS('pointer-events', 'none');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('native appearance controls switch the background to dark mode', async ({ page }) => {
  await openSkin(page);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-ds-dark-theme', '');
  await expect(page.locator('[data-nicole-layers]')).toHaveCSS('opacity', '0.42');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/dsh-pv-0.3.0-dark.png', animations: 'disabled', caret: 'hide' });
});

test('narrow screens keep the artwork without introducing horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSkin(page);
  await expect(page.locator('[data-nicole-layers]')).toHaveCSS('opacity', '0.23');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('[data-nicole-background]')).toHaveCSS('pointer-events', 'none');
  await expect(page.getByRole('button', { name: '下一张背景', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '上一张背景', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/dsh-pv-0.3.0-mobile.png', animations: 'disabled', caret: 'hide' });
});

test('the two-second crossfade blends actual pixels without a blank frame or layout shift', async ({ page }) => {
  await openSkin(page);
  const host = page.locator('[data-slot="conversation"] > [data-phase]');
  const beforeBox = await host.boundingBox();
  const clip = { x: 1080, y: 160, width: 240, height: 180 };
  const before = await page.screenshot({ clip, caret: 'hide' });
  await page.getByRole('button', { name: '下一张背景', exact: true }).click();
  const images = page.locator('[data-nicole-background] img');
  await expect(images).toHaveCount(2);
  const incoming = images.last();
  const duration = await incoming.evaluate(img => {
    const animation = img.getAnimations()[0];
    animation.pause(); animation.currentTime = 1000;
    return animation.effect.getTiming().duration;
  });
  expect(duration).toBe(2000);
  await expect(incoming).toHaveCSS('opacity', '0.5');
  await expect(page.getByRole('button', { name: '下一张背景', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '上一张背景', exact: true })).toBeDisabled();
  const middle = await page.screenshot({ clip, caret: 'hide' });
  await page.screenshot({ path: 'docs/screenshots/dsh-pv-0.3.0-crossfade.png', caret: 'hide' });
  await incoming.evaluate(img => img.getAnimations()[0].finish());
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-index', '1');
  await expect(images).toHaveCount(1);
  const after = await page.screenshot({ clip, caret: 'hide' });
  const [a, mid, b] = await Promise.all([before, middle, after].map(buffer => sharp(buffer).removeAlpha().raw().toBuffer()));
  let error = 0, change = 0;
  for (let i = 0; i < a.length; i++) { error += Math.abs(mid[i] - (a[i] + b[i]) / 2); change += Math.abs(a[i] - b[i]); }
  expect(change / a.length, 'the two background images must visibly differ').toBeGreaterThan(1);
  expect(error / a.length, 'midpoint should be a blend, not a flash to the base colour').toBeLessThan(2);
  expect(await host.boundingBox()).toEqual(beforeBox);
});

test('automatic playback advances without user interaction', async ({ page }) => {
  await page.clock.install();
  await openSkin(page);
  await page.clock.fastForward(60000);
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-index', '1', { timeout: 10000 });
  await expect(page.locator('[data-nicole-background] img')).toHaveAttribute('data-nicole-frame', '00:28');
});

test('pause and selected frame survive refresh, and offline next loads embedded assets', async ({ page, context }) => {
  await openSkin(page);
  await page.getByRole('button', { name: '暂停背景轮播', exact: true }).click();
  await page.getByRole('button', { name: '下一张背景', exact: true }).click();
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-index', '1');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-index', '1');
  await expect(page.getByRole('button', { name: '继续背景轮播', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: '下一张背景', exact: true }).click();
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-index', '2');
  expect(await page.locator('[data-nicole-background] img').evaluate(img => img.src.startsWith('data:image/webp;base64,'))).toBe(true);
  await context.setOffline(false);
});

test('reduced motion preserves manual selection but disables autoplay and animated transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSkin(page);
  await expect(page.getByRole('button', { name: '继续背景轮播', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '下一张背景', exact: true }).click();
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-index', '1');
  await expect(page.locator('[data-nicole-background] img')).toHaveCount(1);
  expect(await page.locator('[data-nicole-background] img').evaluate(img => img.getAnimations().length)).toBe(0);
});

test('all fourteen embedded frames skip 01:26, follow the requested order and loop offline', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSkin(page);
  await context.setOffline(true);
  const order = ['00:17', '00:28', '00:40', '00:49', '00:55', '01:02', '01:17', '01:18', '01:30', '01:31', '01:40', '01:44', '01:47', '01:51', '00:17'];
  for (let i = 0; i < order.length; i++) {
    if (i) await page.getByRole('button', { name: '下一张背景', exact: true }).click();
    await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-phase', 'idle');
    const image = page.locator('[data-nicole-background] img');
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute('data-nicole-frame', order[i]);
    expect(await image.evaluate(img => [img.naturalWidth, img.naturalHeight])).toEqual([1920, 864]);
    if (i === 4) await page.screenshot({ path: 'docs/screenshots/dsh-pv-0.3.0-nicole.png', caret: 'hide' });
  }
  await context.setOffline(false);
});

// Catches a previous button with no handler, wrong endpoint, or a different transition.
test('previous wraps from the first frame to the last with the same two-second fade', async ({ page }) => {
  await openSkin(page);
  await page.getByRole('button', { name: '暂停背景轮播', exact: true }).click();
  await page.getByRole('button', { name: '上一张背景', exact: true }).click();
  const incoming = page.locator('[data-nicole-background] img').last();
  await expect(page.locator('[data-nicole-background] img')).toHaveCount(2);
  const duration = await incoming.evaluate(img => {
    const animation = img.getAnimations()[0];
    animation.pause(); animation.currentTime = 1000;
    return animation.effect.getTiming().duration;
  });
  expect(duration).toBe(2000);
  await expect(incoming).toHaveCSS('opacity', '0.5');
  await expect(page.getByRole('button', { name: '上一张背景', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下一张背景', exact: true })).toBeDisabled();
  await incoming.evaluate(img => img.getAnimations()[0].finish());
  await expect(page.locator('[data-nicole-background] img')).toHaveAttribute('data-nicole-frame', '01:51');
  await expect(page.locator('[data-nicole-status]')).toHaveText('尼可 · 14/14');
  await expect(page.getByRole('button', { name: '继续背景轮播', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一张背景', exact: true }).click();
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('[data-nicole-background] img')).toHaveAttribute('data-nicole-frame', '00:17');
});

test('the native General Settings row provides five persisted choices in light and dark modes', async ({ page }) => {
  await openSkin(page);
  await page.getByRole('button', { name: '暂停背景轮播', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const choice = dialog.getByRole('combobox', { name: '尼可背景切换间隔', exact: true });
  await expect(choice).toHaveValue('1');
  await expect(choice.locator('option')).toHaveText(['1 min', '5 min', '10 min', '30 min', '60 min']);
  for (const mode of ['浅色', '深色']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    for (const minutes of ['1', '5', '10', '30', '60']) {
      await choice.selectOption(minutes);
      await expect(choice).toHaveValue(minutes);
      await expect(page.locator('[data-nicole-status]')).toHaveAttribute('title', `PV 00:17 · 停留 ${minutes} 分钟 · 渐变 2 秒`);
    }
    await page.screenshot({ path: `docs/screenshots/dsh-pv-0.3.0-settings-${mode === '浅色' ? 'light' : 'dark'}.png` });
  }
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: '继续背景轮播', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(choice).toHaveValue('60');
});

test('choosing five minutes through native Settings changes the real playback timer', async ({ page }) => {
  await page.clock.install();
  await openSkin(page);
  await page.getByRole('button', { name: '暂停背景轮播', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('combobox', { name: '尼可背景切换间隔', exact: true }).selectOption('5');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '继续背景轮播', exact: true }).click();
  await page.clock.fastForward(60000);
  await expect(page.locator('[data-nicole-background] img')).toHaveAttribute('data-nicole-frame', '00:17');
  await page.clock.fastForward(240000);
  await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-index', '1', { timeout: 10000 });
});

test('all fourteen frames also traverse backward offline with reduced motion', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSkin(page);
  await context.setOffline(true);
  const reverse = ['01:51', '01:47', '01:44', '01:40', '01:31', '01:30', '01:18', '01:17', '01:02', '00:55', '00:49', '00:40', '00:28', '00:17'];
  for (const timestamp of reverse) {
    await page.getByRole('button', { name: '上一张背景', exact: true }).click();
    await expect(page.locator('[data-nicole-background]')).toHaveAttribute('data-phase', 'idle');
    await expect(page.locator('[data-nicole-background] img')).toHaveAttribute('data-nicole-frame', timestamp);
    expect(await page.locator('[data-nicole-background] img').evaluate(img => img.getAnimations().length)).toBe(0);
  }
  await context.setOffline(false);
});
