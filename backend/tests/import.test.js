process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const app = require('../app');
const Meal = require('../models/Meal');
const User = require('../models/User');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');
const { parseAndValidateMeals, importMeals } = require('../services/catalogueImport');

const headers = 'mealName,cuisine,category,dietaryPreference,calories,protein,servingSize,allergens,source,externalId';
const row = { mealName: 'Test Dal', cuisine: 'General', category: 'Main Dish',
  dietaryPreference: 'Vegetarian', calories: 200, protein: 10, servingSize: '200g',
  allergens: [], source: 'fixture', externalId: 'dal-1' };
let adminToken;

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([Meal.init(), User.init()]);
  const user = await User.create({ username: 'import-admin', email: 'import-admin@example.com',
    password: 'Password123!', role: 'admin' });
  adminToken = `Bearer ${jwt.sign({ id: String(user.id), role: 'admin' }, process.env.JWT_SECRET)}`;
});
afterAll(cleanupTestDatabase);

test('CSV handles quoted comma, newline, quote, BOM, CRLF, aliases and source headers', () => {
  const csv = readFileSync(join(__dirname, 'fixtures/import-valid.csv'), 'utf8');
  const parsed = parseAndValidateMeals({ csv });
  expect(parsed.errors).toEqual([]);
  expect(parsed.rows[0].mealName).toBe('Dal, "special"\nrecipe');
  expect(parsed.rows[0].allergens).toEqual(['milk', 'peanuts', 'tree nuts']);
  const source = parseAndValidateMeals({ csv: 'Food Name,Cuisine,Category,Dietary Preference,Calories (kcal),Protein (g),Serving Size\nDal,General,Main Dish,Vegetarian,200,10,200g' });
  expect(source.rows[0].mealName).toBe('Dal');
  const optional = parseAndValidateMeals({ csv: `${headers}\nDal,General,Main Dish,Vegetarian,200,10,200g,,,` });
  expect(optional.errors).toEqual([]);
  expect(optional.rows[0].allergenStatus).toBe('unknown');
});

test('CSV and JSON reject unknown/duplicate/missing headers, width, bad numbers and injected fields', () => {
  for (const csv of [
    readFileSync(join(__dirname, 'fixtures/import-invalid.csv'), 'utf8'),
    `${headers},mealName\nTest Dal,General,Main Dish,Vegetarian,200,10,200g,,fixture,1,Again`,
    `${headers},popularity\nTest Dal,General,Main Dish,Vegetarian,200,10,200g,,fixture,1,9`,
    'mealName,cuisine\nTest Dal,General',
    `${headers}\nTest Dal,General,Main Dish,Vegetarian,200,10,200g,,fixture`,
    `${headers}\nTest Dal,General,Main Dish,Vegetarian,-2,10,200g,,fixture,1`,
    `${headers}\nTest Dal,General,Main Dish,Vegetarian,,10,200g,,fixture,1`,
  ]) expect(parseAndValidateMeals({ csv }).errors.length).toBeGreaterThan(0);
  for (const meals of [[{ ...row, popularity: 9 }], [{ ...row, calories: '200' }],
    [{ ...row }, { ...row, calories: 300 }], [null], Array(501).fill(row)]) {
    expect(parseAndValidateMeals({ meals }).errors.length).toBeGreaterThan(0);
  }
  expect(parseAndValidateMeals({ csv: '', meals: [row] }).errors.length).toBeGreaterThan(0);
});

test('dry run and retries preserve one ID and crowd statistics while nutrition changes', async () => {
  const parsed = parseAndValidateMeals({ meals: [row] });
  expect(parsed.errors).toEqual([]);
  expect(await importMeals(parsed.rows, { dryRun: true })).toMatchObject({ created: 1, updated: 0 });
  expect(await Meal.countDocuments()).toBe(0);
  expect(await importMeals(parsed.rows)).toMatchObject({ created: 1, updated: 0 });
  const original = await Meal.findOne({ mealName: row.mealName });
  await Meal.updateOne({ _id: original.id }, { $set: { ratingSum: 5, totalRatings: 1,
    averageRating: 5, ratingSummaryVersion: 2, popularity: 1 } });
  expect(await importMeals(parsed.rows)).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  const changed = parseAndValidateMeals({ meals: [{ ...row, calories: 250 }] });
  expect(await importMeals(changed.rows)).toMatchObject({ created: 0, updated: 1 });
  const saved = await Meal.findById(original.id);
  expect(saved.calories).toBe(250);
  expect(saved.ratingSum).toBe(5);
  expect(saved.totalRatings).toBe(1);
  expect(await Meal.countDocuments({ catalogueKey: saved.catalogueKey })).toBe(1);
  await Meal.updateOne({ _id: original.id }, { $set: { isActive: false } });
  await importMeals(changed.rows);
  expect((await Meal.findById(original.id)).isActive).toBe(false);
});

test('concurrent import converges without duplicates', async () => {
  const parsed = parseAndValidateMeals({ meals: [{ ...row, mealName: 'Concurrent', externalId: 'race' }] });
  const results = await Promise.allSettled([importMeals(parsed.rows), importMeals(parsed.rows)]);
  expect(results.some(result => result.status === 'fulfilled')).toBe(true);
  expect(await Meal.countDocuments({ catalogueKey: parsed.rows[0].catalogueKey })).toBe(1);
  expect(await importMeals(parsed.rows)).toMatchObject({ created: 0, unchanged: 1 });
});

test('admin import returns confirmed counts and rejects invalid files without writes', async () => {
  const before = await Meal.countDocuments();
  const invalid = await request(app).post('/api/meals/bulk-import').set('Authorization', adminToken)
    .send({ meals: [{ ...row, totalRatings: 99 }] });
  expect(invalid.status).toBe(400);
  expect(invalid.body.rowErrors.length).toBeGreaterThan(0);
  expect(await Meal.countDocuments()).toBe(before);
  const dryRun = await request(app).post('/api/meals/bulk-import').set('Authorization', adminToken)
    .send({ csv: `${headers}\nOther Dal,General,Main Dish,Vegetarian,200,10,200g,,fixture,other`, dryRun: true });
  expect(dryRun.status).toBe(200);
  expect(dryRun.body).toMatchObject({ created: 1, updated: 0, unchanged: 0, dryRun: true });
  expect(await Meal.countDocuments()).toBe(before);
  const apply = await request(app).post('/api/meals/bulk-import').set('Authorization', adminToken)
    .send({ csv: `${headers}\nOther Dal,General,Main Dish,Vegetarian,200,10,200g,,fixture,other` });
  expect(apply.body).toMatchObject({ created: 1, updated: 0, unchanged: 0, dryRun: false });
});

test('persistence failure reports an unknown partial state with a safe retry', async () => {
  const original = Meal.bulkWrite;
  Meal.bulkWrite = jest.fn().mockRejectedValueOnce(new Error('storage interrupted'));
  try {
    const response = await request(app).post('/api/meals/bulk-import').set('Authorization', adminToken)
      .send({ meals: [{ ...row, mealName: 'Interrupted', externalId: 'interrupted' }] });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: 'partial_unknown', state: 'partial_or_unknown' });
    expect(response.body.created).toBeUndefined();
  } finally {
    Meal.bulkWrite = original;
  }
  const retry = await request(app).post('/api/meals/bulk-import').set('Authorization', adminToken)
    .send({ meals: [{ ...row, mealName: 'Interrupted', externalId: 'interrupted' }] });
  expect(retry.body.created).toBe(1);
});

test('legacy unkeyed catalogue records require migration before an import can duplicate them', async () => {
  const legacy = await Meal.create({ mealName: 'Legacy Dal', cuisine: 'General', category: 'Main Dish',
    dietaryPreference: 'Vegetarian', calories: 200, protein: 10, servingSize: '200g' });
  try {
    const response = await request(app).post('/api/meals/bulk-import').set('Authorization', adminToken)
      .send({ meals: [{ ...row, mealName: 'Legacy Dal', externalId: 'legacy' }] });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('migration_required');
    expect(await Meal.countDocuments({ mealName: 'Legacy Dal' })).toBe(1);
  } finally {
    await Meal.deleteOne({ _id: legacy.id });
  }
});
