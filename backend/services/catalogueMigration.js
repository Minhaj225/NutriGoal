const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const Meal = require('../models/Meal');
const Student = require('../models/Student');
const MealFeedback = require('../models/MealFeedback');
const { normalizeAllergens } = require('./allergens');
const { catalogueKeyFor } = require('./catalogueImport');

const names = ['meals', 'students', 'mealfeedbacks', 'legacyMealArchive'];
const EJSON = mongoose.mongo.BSON.EJSON;

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function mealIndexes(db) {
  const [collection] = await db.listCollections({ name: 'meals' }).toArray();
  return collection ? db.collection('meals').indexes() : [];
}

async function createBackup(directory) {
  if (!directory) throw new Error('A new backup directory is required');
  const db = mongoose.connection.db;
  const data = {};
  for (const name of names) data[name] = await db.collection(name).find({}).toArray();
  const serialized = EJSON.stringify(data);
  const indexes = await mealIndexes(db);
  const manifest = { version: 1, database: db.databaseName, sha256: sha(serialized),
    counts: Object.fromEntries(names.map(name => [name, data[name].length])),
    mealIds: data.meals.map(meal => String(meal._id)),
    catalogueKeys: data.meals.map(meal => meal.catalogueKey || null),
    fullUniqueIndex: indexes.some(index => index.name === 'catalogueKey_unique_full') };
  await fs.mkdir(directory, { mode: 0o700 });
  await fs.writeFile(path.join(directory, 'backup.ejson'), serialized, { mode: 0o600, flag: 'wx' });
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2),
    { mode: 0o600, flag: 'wx' });
  return manifest;
}

async function verifyBackup(directory) {
  const [serialized, rawManifest] = await Promise.all([
    fs.readFile(path.join(directory, 'backup.ejson'), 'utf8'),
    fs.readFile(path.join(directory, 'manifest.json'), 'utf8'),
  ]);
  const manifest = JSON.parse(rawManifest);
  if (manifest.sha256 !== sha(serialized)) throw new Error('Backup checksum mismatch');
  const data = EJSON.parse(serialized);
  if (names.some(name => !Array.isArray(data[name]) || data[name].length !== manifest.counts[name])) {
    throw new Error('Backup count mismatch');
  }
  return { ...manifest, data };
}

async function restoreBackup(directory) {
  const backup = await verifyBackup(directory);
  const db = mongoose.connection.db;
  if (names.some(name => !Array.isArray(backup.data[name]))) throw new Error('Incomplete backup');
  for (const name of names) {
    if (await db.collection(name).countDocuments()) throw new Error('Restore target must be empty');
  }
  if (!backup.fullUniqueIndex) {
    const indexes = await mealIndexes(db);
    if (indexes.some(index => index.name === 'catalogueKey_unique_full')) {
      await db.collection('meals').dropIndex('catalogueKey_unique_full');
    }
  }
  for (const name of names) {
    if (backup.data[name].length) await db.collection(name).insertMany(backup.data[name]);
  }
  return { counts: backup.counts };
}

async function auditCatalogue(remap = {}) {
  const meals = await Meal.find().lean();
  const groups = new Map();
  const namesByKey = new Map();
  const unresolved = [];
  for (const meal of meals) {
    try {
      const key = meal.catalogueKey || catalogueKeyFor(meal);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(meal);
      const name = meal.mealName.normalize('NFKC').trim().toLowerCase();
      if (!namesByKey.has(name)) namesByKey.set(name, []);
      namesByKey.get(name).push({ id: String(meal._id), key });
    } catch { unresolved.push(String(meal._id)); }
  }
  const collisions = [...groups].filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({ key, ids: entries.map(meal => String(meal._id)) }));
  const identityConflicts = [...namesByKey].filter(([, entries]) =>
    new Set(entries.map(entry => entry.key)).size > 1)
    .map(([name, entries]) => ({ name, ids: entries.map(entry => entry.id),
      keys: [...new Set(entries.map(entry => entry.key))] }));
  const invalidRemap = collisions.some(({ ids }) => {
    const survivors = ids.filter(id => !remap[id]);
    return survivors.length !== 1 || ids.some(id => remap[id] && remap[id] !== survivors[0]);
  }) || Object.keys(remap).some(id => !collisions.some(group => group.ids.includes(id)));
  const feedback = await MealFeedback.find().lean();
  const seen = new Set();
  const feedbackCollisions = [];
  for (const item of feedback) {
    const mealId = remap[String(item.mealId)] || String(item.mealId);
    const key = `${item.studentId}:${mealId}`;
    if (seen.has(key)) feedbackCollisions.push(key);
    seen.add(key);
  }
  return { meals, groups, collisions, identityConflicts, unresolved, invalidRemap,
    feedbackCollisions, unownedProfiles: await Student.countDocuments({ userId: { $exists: false } }) };
}

async function applyCatalogueMigration({ backupDir, remap = {} }) {
  const audit = await auditCatalogue(remap);
  if (audit.unresolved.length || audit.invalidRemap || audit.feedbackCollisions.length) {
    throw new Error('Catalogue has unresolved identities or feedback collisions; supply a reviewed ID remap');
  }
  await createBackup(backupDir);
  const session = await mongoose.startSession();
  let migrated = 0;
  try {
    await session.withTransaction(async () => {
      for (const [oldId, canonicalId] of Object.entries(remap)) {
        const old = audit.meals.find(meal => String(meal._id) === oldId);
        await mongoose.connection.db.collection('legacyMealArchive').insertOne({
          _id: old._id, archivedAt: new Date(), provenance: 'legacy_unverified', meal: old,
        }, { session });
        await Student.collection.updateMany({ 'mealHistory.mealId': old._id },
          { $set: { 'mealHistory.$[entry].mealId': new mongoose.Types.ObjectId(canonicalId) } },
          { arrayFilters: [{ 'entry.mealId': old._id }], session });
        await MealFeedback.collection.updateMany({ mealId: old._id },
          { $set: { mealId: new mongoose.Types.ObjectId(canonicalId) } }, { session });
        await Meal.collection.deleteOne({ _id: old._id }, { session });
      }
      for (const [key, entries] of audit.groups) {
        const meal = entries.find(item => !remap[String(item._id)]);
        if (!meal) continue;
        const update = { catalogueKey: key,
          allergens: normalizeAllergens(meal.allergens || []),
          allergenStatus: meal.allergenStatus || 'unknown' };
        if (meal.ratingSummaryVersion !== 2) {
          update.legacyRatingSummary = { averageRating: meal.averageRating || 0,
            totalRatings: meal.totalRatings || 0, popularity: meal.popularity || 0 };
          Object.assign(update, { ratingSum: 0, totalRatings: 0, averageRating: 0,
            popularity: 0, ratingSummaryVersion: 2 });
        }
        if (!meal.catalogueKey || meal.ratingSummaryVersion !== 2 ||
            JSON.stringify(meal.allergens) !== JSON.stringify(update.allergens) || !meal.allergenStatus) {
          await Meal.collection.updateOne({ _id: meal._id }, { $set: update }, { session });
          migrated++;
        }
      }
    });
  } finally { await session.endSession(); }
  await Meal.collection.createIndex({ catalogueKey: 1 }, { unique: true, name: 'catalogueKey_unique_full' });
  return { migrated, remapped: Object.keys(remap).length, unownedProfiles: audit.unownedProfiles };
}

async function migrateLegacyFeedback({ backupDir, dryRun = false }) {
  const students = await Student.find({ userId: { $exists: true } }).lean();
  const mealIds = new Set((await Meal.find().select('_id').lean()).map(meal => String(meal._id)));
  const latest = new Map();
  for (const student of students) {
    for (const item of student.mealHistory || []) {
      if (!mealIds.has(String(item.mealId)) || typeof item.liked !== 'boolean' ||
          !(item.consumedAt instanceof Date)) continue;
      const key = `${student.userId}:${item.mealId}`;
      if (!latest.has(key) || latest.get(key).feedbackAt < item.consumedAt) {
        latest.set(key, { studentId: student.userId, mealId: item.mealId,
          liked: item.liked, feedbackAt: item.consumedAt,
          source: 'legacy_unverified', schemaVersion: 1 });
      }
    }
  }
  const pairs = [...latest.values()].map(item => ({
    studentId: item.studentId, mealId: item.mealId,
  }));
  const existing = pairs.length ? await MealFeedback.find({ $or: pairs }).lean() : [];
  const seen = new Set(existing.map(item => `${item.studentId}:${item.mealId}`));
  const pending = [...latest].filter(([key]) => !seen.has(key)).map(([, item]) => item);
  if (dryRun) return { wouldCreate: pending.length, skipped: latest.size - pending.length,
    unownedProfiles: await Student.countDocuments({ userId: { $exists: false } }) };
  await createBackup(backupDir);
  if (pending.length) {
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => { await MealFeedback.insertMany(pending, { session }); }); }
    finally { await session.endSession(); }
  }
  return { created: pending.length, skipped: latest.size - pending.length,
    unownedProfiles: await Student.countDocuments({ userId: { $exists: false } }) };
}

module.exports = { auditCatalogue, applyCatalogueMigration, createBackup,
  verifyBackup, restoreBackup, migrateLegacyFeedback };
