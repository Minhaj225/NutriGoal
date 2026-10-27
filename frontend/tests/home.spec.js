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
  await expect(page.getByText('Baseline recommendations')).toBeVisible();
});
