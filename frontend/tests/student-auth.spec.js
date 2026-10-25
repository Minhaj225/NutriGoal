import { test, expect } from '@playwright/test';

test('student registers, saves owned profile, and cannot switch identity with an email link', async ({ page }) => {
  const writes = [];
  let profile = null;
  await page.route('**/api/auth/register', route => route.fulfill({ status: 201, json: {
    success: true, token: 'student.test.token', id: '000000000000000000000001',
    role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    id: '000000000000000000000001', role: 'student', username: 'alice@example.com', email: 'alice@example.com',
  } }));
  await page.route('**/api/students/me', route => {
    if (route.request().method() === 'GET') return route.fulfill(profile
      ? { json: { success: true, student: profile } }
      : { status: 404, json: { error: 'Student not found' } });
    writes.push({ authorization: route.request().headers().authorization, body: route.request().postDataJSON() });
    profile = { ...route.request().postDataJSON(), email: 'alice@example.com' };
    return route.fulfill({ json: { success: true, student: profile } });
  });

  await page.goto('/profile?email=bob@example.com');
  await expect(page).toHaveURL(/\/student\/login$/);
  await page.getByRole('button', { name: 'New student? Create an account' }).click();
  await page.getByLabel('Email').fill('Alice@Example.com');
  await page.getByLabel('Password').fill('LongSecurePass123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel('Email *')).toHaveValue('alice@example.com');
  await page.getByLabel('Name *').fill('Alice');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Profile saved successfully!')).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].authorization).toBe('Bearer student.test.token');
  expect(writes[0].body.email).toBeUndefined();
  expect(writes[0].body.nutritionGoals.caloriesPerDay).toBe(2000);

  await page.goto('/profile?email=bob@example.com');
  await expect(page.getByLabel('Email *')).toHaveValue('alice@example.com');
});

test('legacy profile signup gives a useful ownership message', async ({ page }) => {
  await page.route('**/api/auth/register', route => route.fulfill({ status: 409, json: { error: 'profile_claim_required' } }));
  await page.goto('/student/login');
  await page.getByRole('button', { name: 'New student? Create an account' }).click();
  await page.getByLabel('Email').fill('legacy@example.com');
  await page.getByLabel('Password').fill('LongSecurePass123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('Ask an administrator');
});
