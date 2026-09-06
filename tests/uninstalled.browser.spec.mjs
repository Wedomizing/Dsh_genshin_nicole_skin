import { test, expect } from '@playwright/test';

test('official uninstall restores the native DSH conversation background', async ({ page }) => {
  for (const name of ['继续', '稍后配置']) {
    await page.addLocatorHandler(page.getByRole('button', { name, exact: true }), button => button.click());
  }
  await page.goto(process.env.DSH_TEST_URL ?? './', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-slot="conversation"] > [data-phase]')).toBeVisible();
  await expect(page.locator('[data-nicole-background]')).toHaveCount(0);
  await expect(page.locator('[data-nicole-styles]')).toHaveCount(0);
  await expect(page.locator('[data-nicole-controls]')).toHaveCount(0);
  expect(await page.locator('body').getAttribute('data-dsh-genshin-nicole')).toBeNull();
  expect(await page.locator('[data-slot="conversation"] > [data-phase]').evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: 'docs/screenshots/dsh-pv-0.3.0-uninstalled.png', animations: 'disabled', caret: 'hide' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '尼可背景切换间隔', exact: true })).toHaveCount(0);
});
