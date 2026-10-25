import { test, expect } from '@playwright/test';

test('one star click makes one mutation and displays the saved summary', async ({ page }) => {
  const writes = [];
  await page.addInitScript(() => localStorage.setItem('authSession', JSON.stringify({
    token: 'student.test.token', role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  })));
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    id: '000000000000000000000001', role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  } }));
  await page.route('**/api/students/me', route => route.fulfill({ json: { success: true, student: {
    name: 'Alice', email: 'alice@example.com', preferences: { dietaryPreference: 'Vegetarian', cuisines: [] },
    nutritionGoals: { caloriesPerDay: 2000, proteinGramsPerDay: 80 }, activityLevel: 'Moderate',
  } } }));
  await page.route('**/api/meals/recommend/me**', route => route.fulfill({ json: { success: true, recommendations: [{
    _id: '000000000000000000000010', mealName: 'Test Dal', cuisine: 'North Indian', category: 'Main Dish',
    dietaryPreference: 'Vegetarian', calories: 180, protein: 9, averageRating: 0, totalRatings: 0,
  }] } }));
  await page.route('**/api/meals/000000000000000000000010/rate', route => {
    writes.push({ path: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { success: true, newAverageRating: 1, totalRatings: 1, ratingSum: 1, liked: false, rating: 1 } });
  });
  await page.route('**/api/students/me/feedback', route => {
    writes.push({ path: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { success: true } });
  });

  await page.goto('/recommendations');
  await page.getByRole('button', { name: 'Get My Recommendations' }).click();
  await expect(page.getByRole('heading', { name: 'Test Dal' })).toBeVisible();
  await page.locator('article').getByRole('button').first().click();
  await expect(page.getByText('1.0 ⭐ (1)')).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toContain('/rate');
  expect(writes[0].body).toEqual({ rating: 1 });

  await page.route('**/api/meals/000000000000000000000010/rate', route => {
    writes.push({ path: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 500, json: { error: 'Internal Server Error' } });
  });
  await page.getByRole('button', { name: 'Rate 2 stars' }).click();
  await expect(page.getByRole('alert')).toContainText('Failed to submit rating');
  await expect(page.getByText('1.0 ⭐ (1)')).toBeVisible();
  expect(writes).toHaveLength(2);
});
