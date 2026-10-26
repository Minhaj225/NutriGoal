process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const mongoose = require('mongoose');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const Meal = require('../models/Meal');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');
const { safeErrorMessage } = require('../scripts/migrationCli');

beforeAll(connectTestDatabase);
afterAll(cleanupTestDatabase);

test('migration diagnostics redact database credentials', () => {
  const uri = 'mongodb://operator:private-value@database.example/catalogue';
  const message = safeErrorMessage(new Error(`Connection failed for ${uri}`));
  expect(message).not.toContain('private-value');
  expect(message).toContain('[redacted database URI]');
});

test('importing the seeder does not connect, delete, or write', () => {
  const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  const remove = jest.spyOn(Meal, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
  const insert = jest.spyOn(Meal, 'insertMany').mockResolvedValue([]);
  try {
    require('../scripts/seedMeals');
    expect(connect.mock.calls.length).toBe(0);
    expect(remove).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  } finally {
    connect.mockRestore(); remove.mockRestore(); insert.mockRestore();
  }
});

test('seeder uses validated import and rerun preserves IDs and old catalogue on bad CSV', async () => {
  const { seedFromCsv } = require('../scripts/seedMeals');
  const csv = 'mealName,cuisine,category,dietaryPreference,calories,protein,servingSize,source,externalId\nSeed Dal,General,Main Dish,Vegetarian,200,10,200g,curated,dal-1';
  expect(await seedFromCsv(csv, { dryRun: true })).toMatchObject({ created: 1 });
  expect(await seedFromCsv(csv)).toMatchObject({ created: 1 });
  const saved = await Meal.findOne({ mealName: 'Seed Dal' });
  expect(saved.catalogueKey).toMatch(/^source:/);
  expect(await seedFromCsv(csv)).toMatchObject({ unchanged: 1 });
  expect((await Meal.findOne({ mealName: 'Seed Dal' })).id).toBe(saved.id);
  await expect(seedFromCsv(csv.replace(',200,10,', ',-2,10,'))).rejects.toThrow();
  expect((await Meal.findOne({ mealName: 'Seed Dal' })).id).toBe(saved.id);
});

test('seeder CLI exits nonzero on an invalid file before connecting', () => {
  const result = spawnSync(process.execPath, [join(__dirname, '../scripts/seedMeals.js'),
    '--uri', 'mongodb://127.0.0.1:27018/nutrigoal_test',
    '--file', join(__dirname, 'fixtures/import-invalid.csv')], {
    cwd: '/tmp', env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/CSV validation failed/);
});
