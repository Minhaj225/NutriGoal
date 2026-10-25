import { test, expect } from '@playwright/test';

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
