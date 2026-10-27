import { test, expect } from '@playwright/test';

test('home shows no-rating and unavailable-readiness states without crashing', async ({ page }) => {
  await page.route('**/api/ready', route => route.fulfill({ status: 503,
    json: { status: 'unavailable', components: { database: 'unavailable' } } }));
  await page.route('**/api/meals/stats', route => route.fulfill({ json: { success: true,
    stats: { totalMeals: 0, cuisineCount: 0, categoryCount: 0,
      averageRating: null, ratingCount: 0 } } }));
  await page.route('**/api/meals?**', route => route.fulfill({ json: { meals: [], total: 0 } }));
  await page.route('**/api/', route => route.fulfill({ json: { recommendationMode: 'baseline' } }));
  await page.goto('/');
  await expect(page.getByText('Community Rating (0)')).toBeVisible();
  await expect(page.getByText('Issues ✕')).toBeVisible();
  await expect(page.getByText('Recommendation status unavailable')).toBeVisible();
});

test('home reports an API outage and gives a working retry', async ({ page }) => {
  let available = false;
  await page.route('**/api/**', route => available
    ? route.fulfill({ json: route.request().url().includes('/ready')
      ? { status: 'ready', components: { recommender: 'baseline' } }
      : route.request().url().includes('/stats')
        ? { stats: { totalMeals: 1, cuisineCount: 1, categoryCount: 1, averageRating: null, ratingCount: 0 } }
        : { meals: [], total: 0 } })
    : route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Dashboard data is unavailable');
  await expect(page.getByText('Service status: unavailable')).toBeVisible();
  available = true;
  await page.getByRole('button', { name: 'Try Again' }).click();
  await expect(page.getByText('Service status: ready')).toBeVisible();
});

test('unknown routes show a way back', async ({ page }) => {
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
});
