import { test, expect } from '@playwright/test';

test('mobile menu is absent when closed and Escape returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  await expect(page.getByRole('link', { name: 'Browse', exact: true })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'Browse', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.getByRole('link', { name: 'Browse', exact: true })).toHaveCount(0);
});

test('reduced motion shows a stable heading without a cursor', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Eat smarter.');
  await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Eat smarter.');
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('|');
});

test('button and small-text color pairs meet normal-text contrast', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Example meals')).toBeVisible();
  const ratios = await page.evaluate(() => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
        const x = value / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const contrast = (first, second) => {
      const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    };
    const button = document.querySelector('a.bg-primary.text-white');
    const sampleText = document.querySelector('.bg-surface-alt .text-text-muted');
    return [contrast(getComputedStyle(button).color, getComputedStyle(button).backgroundColor),
      contrast(getComputedStyle(sampleText).color, getComputedStyle(sampleText.parentElement).backgroundColor)];
  });
  expect(ratios[0]).toBeGreaterThanOrEqual(4.5);
  expect(ratios[1]).toBeGreaterThanOrEqual(4.5);
});
