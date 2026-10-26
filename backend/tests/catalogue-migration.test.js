process.env.NODE_ENV = 'test';

const { mkdtemp, rm, cp, appendFile } = require('node:fs/promises');
const { join } = require('node:path');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const Meal = require('../models/Meal');
const Student = require('../models/Student');
const MealFeedback = require('../models/MealFeedback');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');
const { auditCatalogue, applyCatalogueMigration, verifyBackup, restoreBackup,
  migrateLegacyFeedback } = require('../services/catalogueMigration');

let temp;
let first;
let duplicate;
let student;

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([Meal.init(), Student.init(), MealFeedback.init()]);
  temp = await mkdtemp('/tmp/nutrigoal-migration-');
  const base = { mealName: 'Legacy Dal', cuisine: 'General', category: 'Main Dish',
    dietaryPreference: 'Vegetarian', calories: 200, protein: 10, servingSize: '200g',
    allergens: ['DAIRY'], popularity: 50, totalRatings: 10, averageRating: 4.5 };
  first = await Meal.create(base);
  duplicate = await Meal.create({ ...base, calories: 220 });
  student = await Student.create({ name: 'Owner', email: 'owner@example.com',
    userId: new mongoose.Types.ObjectId(), mealHistory: [
      { mealId: duplicate.id, liked: false, consumedAt: new Date('2025-01-01') },
      { mealId: duplicate.id, liked: true, consumedAt: new Date('2025-02-01') },
    ] });
  await Student.create({ name: 'Unowned', email: 'unowned@example.com' });
});
afterAll(async () => { await cleanupTestDatabase(); if (temp) await rm(temp, { recursive: true, force: true }); });

test('audit refuses collisions until a reviewed ID remap is supplied', async () => {
  const audit = await auditCatalogue();
  expect(audit.collisions).toHaveLength(1);
  expect(audit.unownedProfiles).toBe(1);
  await expect(applyCatalogueMigration({ backupDir: join(temp, 'blocked') })).rejects.toThrow(/remap/i);
  expect((await Meal.findById(first.id)).catalogueKey).toBeUndefined();
});

test('same name with different catalogue identities is reported without merging', async () => {
  const variant = await Meal.create({ mealName: 'Legacy Dal', cuisine: 'General',
    category: 'Main Dish', dietaryPreference: 'Vegetarian', calories: 300,
    protein: 12, servingSize: '300g' });
  try {
    const audit = await auditCatalogue({ [String(duplicate.id)]: String(first.id) });
    expect(audit.identityConflicts.some(item => item.ids.includes(String(variant.id)))).toBe(true);
    expect(audit.collisions).toHaveLength(1);
  } finally { await Meal.findByIdAndDelete(variant.id); }
});

test('migration backs up, remaps references, normalizes tags, archives legacy summaries, and is idempotent', async () => {
  const remap = { [String(duplicate.id)]: String(first.id) };
  const backupDir = join(temp, 'backup');
  const result = await applyCatalogueMigration({ backupDir, remap });
  expect(result).toMatchObject({ migrated: 1, remapped: 1 });
  const verified = await verifyBackup(backupDir);
  expect(verified.counts.meals).toBe(2);
  const saved = await Meal.findById(first.id);
  expect(saved.catalogueKey).toMatch(/^fallback:/);
  expect(saved.allergens).toEqual(['milk']);
  expect(saved.allergenStatus).toBe('unknown');
  expect(saved.legacyRatingSummary).toMatchObject({ totalRatings: 10, averageRating: 4.5 });
  expect(saved.totalRatings).toBe(0);
  expect(await Meal.findById(duplicate.id)).toBeNull();
  expect((await Student.findById(student.id)).mealHistory.every(item => String(item.mealId) === String(first.id))).toBe(true);
  expect(await mongoose.connection.db.collection('legacyMealArchive').countDocuments()).toBe(1);
  const again = await applyCatalogueMigration({ backupDir: join(temp, 'second') });
  expect(again).toMatchObject({ migrated: 0, remapped: 0 });
  expect(await Meal.countDocuments()).toBe(1);
});

test('legacy feedback keeps only latest owned history without inventing ratings', async () => {
  const result = await migrateLegacyFeedback({ backupDir: join(temp, 'feedback') });
  expect(result.created).toBe(1);
  const feedback = await MealFeedback.findOne({ studentId: student.userId, mealId: first.id });
  expect(feedback).toMatchObject({ liked: true, source: 'legacy_unverified', schemaVersion: 1 });
  expect(feedback.rating).toBeUndefined();
  expect(await migrateLegacyFeedback({ backupDir: join(temp, 'feedback-second') })).toMatchObject({ created: 0 });
});

test('backup restores exact original records in a separate isolated database', async () => {
  const sourceName = mongoose.connection.db.databaseName;
  const restoredName = `nutrigoal_test_${randomBytes(8).toString('hex')}`;
  const uri = new URL(process.env.TEST_MONGO_URI);
  try {
    await mongoose.disconnect();
    uri.pathname = `/${restoredName}`;
    await mongoose.connect(uri.toString(), { directConnection: true });
    expect(mongoose.connection.db.databaseName).toBe(restoredName);
    const restored = await restoreBackup(join(temp, 'backup'));
    expect(restored.counts.meals).toBe(2);
    expect(await Meal.countDocuments()).toBe(2);
    expect((await Meal.findById(first.id)).totalRatings).toBe(10);
    expect((await Student.findById(student.id)).mealHistory[0].mealId.toString()).toBe(duplicate.id);
  } finally {
    if (mongoose.connection.db?.databaseName === restoredName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    uri.pathname = `/${sourceName}`;
    await mongoose.connect(uri.toString(), { directConnection: true });
  }
});

test('backup verification rejects a changed archive', async () => {
  const damaged = join(temp, 'damaged');
  await cp(join(temp, 'backup'), damaged, { recursive: true });
  await appendFile(join(damaged, 'backup.ejson'), ' ');
  await expect(verifyBackup(damaged)).rejects.toThrow(/checksum/i);
});
