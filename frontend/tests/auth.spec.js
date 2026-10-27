import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

async function mockApi(page, role = 'admin') {
  const writes = [];
  await page.route('**/api/auth/login', route => route.fulfill({ json: {
    success: true, token: 'test.admin.token', role, username: role,
  } }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: route.request().headers().authorization === 'Bearer test.admin.token' ? 200 : 401,
    json: { id: '000000000000000000000001', username: role, role },
  }));
  await page.route('**/api/meals**', route => {
    if (route.request().method() === 'POST') {
      writes.push(route.request().headers().authorization);
      return route.fulfill({ json: { success: true, meal: { mealName: 'Test Dal' } } });
    }
    return route.fulfill({ json: { meals: [], totalPages: 1 } });
  });
  await page.route('**/features', route => route.fulfill({ json: { features: [] } }));
  return writes;
}

async function login(page, username = 'admin') {
  await page.goto('/admin/login');
  await page.getByPlaceholder('Enter admin username').fill(username);
  await page.getByPlaceholder('Enter password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test('admin login persists a token through reload and sends one authenticated write', async ({ page }) => {
  const writes = await mockApi(page);
  await login(page);
  await expect(page).toHaveURL(/\/admin\/meals$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('authSession')).token)).toBe('test.admin.token');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add New Meal' })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await page.getByLabel('Meal Name *').fill('Test Dal');
  await page.getByLabel('Calories *').fill('180');
  await page.getByLabel('Protein (g) *').fill('9');
  await page.getByRole('button', { name: 'Add Meal' }).click();
  await expect(page.getByText('Meal added successfully!')).toBeVisible();
  expect(writes).toEqual(['Bearer test.admin.token']);
});

test('staff login does not open admin UI', async ({ page }) => {
  await mockApi(page, 'staff');
  await login(page, 'staff');
  await expect(page.getByText('Administrative access required')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('a forged local admin flag cannot open the route', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('isAdmin', 'true'));
  await page.goto('/admin/meals');
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('login shows the backend error and logout clears credentials', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { error: 'Invalid credentials' } }));
  await login(page);
  await expect(page.getByText('Invalid credentials')).toBeVisible();

  await page.unroute('**/api/auth/login');
  await mockApi(page);
  await login(page);
  await expect(page).toHaveURL(/\/admin\/meals$/);
  await page.getByRole('button', { name: 'Open user menu' }).click();
  await page.getByRole('menuitem', { name: 'Admin Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => ['authSession', 'token', 'isAdmin', 'adminUser'].map(k => localStorage.getItem(k)))).toEqual([null, null, null, null]);
});

test('a forbidden write leaves a valid admin session available', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/meals', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 403, json: { error: 'Forbidden' } })
    : route.fallback());
  await login(page);
  await expect(page).toHaveURL(/\/admin\/meals$/);
  await page.getByLabel('Meal Name *').fill('Test Dal');
  await page.getByLabel('Calories *').fill('180');
  await page.getByLabel('Protein (g) *').fill('9');
  await page.getByRole('button', { name: 'Add Meal' }).click();
  await expect(page.getByText(/Failed to add meal/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('authSession')).role)).toBe('admin');
  await expect(page).toHaveURL(/\/admin\/meals$/);
});

test('admin feature display uses the authenticated backend proxy', async ({ page }) => {
  await mockApi(page);
  const requests = [];
  await page.route('**/api/meals/ml/features', route => {
    requests.push({ url: route.request().url(), token: route.request().headers().authorization });
    return route.fulfill({ json: { features: ['calories', 'protein'], modelVersion: 'test-v1' } });
  });
  await login(page);
  await expect(page).toHaveURL(/\/admin\/meals$/);
  await expect(page.getByRole('heading', { name: 'ML Features' })).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(item => item.url.includes('/api/meals/ml/features') &&
    item.token === 'Bearer test.admin.token')).toBe(true);
});

test('CSV import previews and reports server-confirmed counts', async ({ page }) => {
  await mockApi(page);
  const calls = [];
  await page.route('**/api/meals/bulk-import', route => {
    const body = route.request().postDataJSON();
    calls.push(body);
    return route.fulfill({ json: { success: true, created: 0, updated: 1,
      unchanged: 0, rejected: 0, dryRun: body.dryRun } });
  });
  await login(page);
  await expect(page).toHaveURL(/\/admin\/meals$/);
  const csv = 'mealName,cuisine,category,dietaryPreference,calories,protein,servingSize\n"Dal, special",General,Main Dish,Vegetarian,200,10,200g';
  await page.getByLabel('CSV File').setInputFiles({ name: 'meals.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText('Preview: 0 created, 1 updated, 0 unchanged, 0 rejected')).toBeVisible();
  expect(calls[0]).toEqual({ csv, dryRun: true });
  await page.getByRole('button', { name: 'Apply Import' }).click();
  await expect.poll(() => calls.length).toBe(2);
  await expect(page.getByText('0 created, 1 updated, 0 unchanged, 0 rejected', { exact: true })).toBeVisible();
  expect(calls[1]).toEqual({ csv, dryRun: false });
});

test('CSV validation errors show the server row count and reason', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/meals/bulk-import', route => route.fulfill({ status: 400, json: {
    error: 'invalid_import', rejected: 1, rowErrors: [{ row: 2, message: 'Invalid calories' }],
  } }));
  await login(page);
  await expect(page).toHaveURL(/\/admin\/meals$/);
  await page.getByLabel('CSV File').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv',
    buffer: Buffer.from('mealName,calories\nDal,-2') });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText('1 rejected: Row 2: Invalid calories')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply Import' })).toHaveCount(0);
});

test('admin edits a meal and can retry a failed delete', async ({ page }) => {
  await mockApi(page);
  let meal = { _id: '000000000000000000000010', mealName: 'Test Dal', cuisine: 'General',
    category: 'Main Dish', dietaryPreference: 'Vegetarian', calories: 180, protein: 9,
    carbohydrates: 28, fats: 7, totalRatings: 2, averageRating: 4,
    allergenStatus: 'unknown', allergens: [], ingredients: [] };
  let deleteCalls = 0;
  await page.route('**/api/meals?**', route => route.fulfill({ json: {
    success: true, meals: meal ? [meal] : [], totalPages: 1,
  } }));
  await page.route('**/api/meals/000000000000000000000010', route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.nutritionScore).toBeUndefined();
      expect(body.averageRating).toBeUndefined();
      meal = { ...meal, ...body };
      return route.fulfill({ json: { success: true, meal } });
    }
    deleteCalls += 1;
    if (deleteCalls === 1) return route.fulfill({ status: 503, json: { error: 'Try again' } });
    meal = null;
    return route.fulfill({ json: { success: true } });
  });
  await login(page);
  await expect(page.getByText('Test Dal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test Dal' }).click();
  await page.getByLabel('Protein (g) *').fill('12');
  await page.getByLabel('Carbohydrates (g)').fill('');
  await page.getByLabel('Fats (g)').fill('');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Meal updated successfully!')).toBeVisible();
  expect(meal.protein).toBe(12);
  expect(meal.carbohydrates).toBeNull();
  expect(meal.fats).toBeNull();
  expect(meal.totalRatings).toBe(2);
  const deleteButton = page.getByRole('button', { name: 'Delete Test Dal' });
  await deleteButton.click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(deleteButton).toBeFocused();
  await deleteButton.click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Try again');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(deleteCalls).toBe(2);
});
