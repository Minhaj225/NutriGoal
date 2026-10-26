import { test, expect } from '@playwright/test';

test('an allergy profile shows only verified matches and explains excluded meals', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('authSession', JSON.stringify({
    token: 'student.test.token', role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  })));
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    id: '000000000000000000000001', role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  } }));
  let profile = null;
  await page.route('**/api/students/me', route => {
    if (route.request().method() === 'GET') return route.fulfill(profile
      ? { json: { success: true, student: profile } }
      : { status: 404, json: { error: 'Student not found' } });
    profile = { ...route.request().postDataJSON(), email: 'alice@example.com' };
    return route.fulfill({ json: { success: true, student: profile } });
  });
  await page.route('**/api/meals/recommend/me**', route => route.fulfill({ json: {
    success: true, recommendations: [{ _id: '000000000000000000000010', mealName: 'Safe Dal',
      cuisine: 'North Indian', category: 'Main Dish', dietaryPreference: 'Vegetarian',
      allergens: [], allergenStatus: 'verified', calories: 300, protein: 20,
      confidence: null, rankingScore: 0.36 }],
    excludedUnknownAllergenCount: 2, totalEligible: 1, totalMealsEvaluated: 1,
    recommendationMode: 'baseline', degradedReason: 'model_unavailable',
  } }));

  await page.goto('/profile');
  await page.getByLabel('Name *').fill('Alice');
  await page.getByLabel('Allergies').fill('dairy');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Profile saved successfully!')).toBeVisible();
  expect(profile.allergies).toEqual(['dairy']);
  await page.goto('/recommendations');
  await page.getByRole('button', { name: 'Get My Recommendations' }).click();
  await expect(page.getByRole('heading', { name: 'Safe Dal' })).toBeVisible();
  await expect(page.getByText(/2 otherwise matching meals excluded/)).toBeVisible();
  await expect(page.getByText(/Showing the eligible meals ranked by verified crowd ratings/)).toBeVisible();
  await expect(page.getByText('Crowd rating ranking')).toBeVisible();
  await expect(page.getByText('Avg Confidence')).toHaveCount(0);
});
