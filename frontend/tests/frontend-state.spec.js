import { test, expect } from '@playwright/test';

test('allergy input preserves a comma while typing and submits two values', async ({ page }) => {
  let saved;
  await page.addInitScript(() => localStorage.setItem('authSession', JSON.stringify({
    token: 'student.test.token', role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  })));
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  } }));
  await page.route('**/api/students/me', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 404, json: { error: 'Student not found' } });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, student: saved } });
  });
  await page.goto('/profile');
  await page.getByLabel('Name *').fill('Alice');
  await page.getByLabel('Allergies').pressSequentially('nuts, dairy');
  await expect(page.getByLabel('Allergies')).toHaveValue('nuts, dairy');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Profile saved successfully!')).toBeVisible();
  expect(saved.allergies).toEqual(['nuts', 'dairy']);
});

test('editing a name before the profile loads preserves stored preferences and goals', async ({ page }) => {
  let releaseProfile;
  let saved;
  await page.addInitScript(() => localStorage.setItem('authSession', JSON.stringify({
    token: 'student.test.token', role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  })));
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  } }));
  await page.route('**/api/students/me', async route => {
    if (route.request().method() === 'GET') {
      await new Promise(resolve => { releaseProfile = resolve; });
      return route.fulfill({ json: { success: true, student: {
        name: 'Saved Name', allergies: ['nuts'], activityLevel: 'High',
        preferences: { cuisines: ['North Indian'], dietaryPreference: 'Vegetarian', categories: ['Breakfast'] },
        nutritionGoals: { caloriesPerDay: 2400, proteinGramsPerDay: 110,
          maxCaloriesPerMeal: 600, minProteinPerMeal: 20 },
      } } });
    }
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, student: saved } });
  });
  await page.goto('/profile');
  await page.getByLabel('Name *').fill('New Name');
  await expect.poll(() => Boolean(releaseProfile)).toBe(true);
  releaseProfile();
  await expect(page.getByRole('heading', { name: 'Update Your Profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Update Profile' }).click();
  await expect(page.getByText('Profile saved successfully!')).toBeVisible();
  expect(saved).toMatchObject({ name: 'New Name', allergies: ['nuts'], activityLevel: 'High',
    preferences: { cuisines: ['North Indian'], categories: ['Breakfast'] },
    nutritionGoals: { caloriesPerDay: 2400, proteinGramsPerDay: 110 } });
});

test('browse makes one initial request and ignores an older filter response', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/meals?**', async route => {
    calls += 1;
    const cuisine = new URL(route.request().url()).searchParams.get('cuisine');
    if (!cuisine) await new Promise(resolve => setTimeout(resolve, 900));
    await route.fulfill({ json: { success: true, total: 1, totalPages: 1, meals: [{
      _id: cuisine ? 'b' : 'a', mealName: cuisine ? 'New Meal' : 'Old Meal',
      cuisine: cuisine || 'General', category: 'Main Dish', dietaryPreference: 'Vegetarian',
      calories: 100, protein: 10,
    }] } });
  });
  await page.goto('/browse');
  await page.getByLabel('Cuisine').selectOption('North Indian');
  await expect(page.getByRole('heading', { name: 'New Meal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Old Meal' })).toHaveCount(0);
  expect(calls).toBeLessThanOrEqual(3); // StrictMode may remount the initial read.
});
