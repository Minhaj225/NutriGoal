const { createHash } = require('node:crypto');
const { parse } = require('csv-parse/sync');
const Meal = require('../models/Meal');
const { meal: validateMeal } = require('../validation');
const { normalizeAllergens } = require('./allergens');

const headers = {
  'Food Name': 'mealName', 'Cuisine': 'cuisine', 'Category': 'category',
  'Dietary Preference': 'dietaryPreference', 'Calories (kcal)': 'calories',
  'Protein (g)': 'protein', 'Carbohydrates (g)': 'carbohydrates',
  'Fats (g)': 'fats', 'Serving Size': 'servingSize',
  'Allergens': 'allergens', 'Ingredients': 'ingredients',
  'Source': 'source', 'External ID': 'externalId', 'Source Category': 'sourceCategory',
};
const fields = new Set(['mealName', 'cuisine', 'category', 'dietaryPreference',
  'calories', 'protein', 'carbohydrates', 'fats', 'servingSize', 'allergens',
  'allergenStatus', 'ingredients', 'description', 'imageUrl', 'nutritionScore',
  'source', 'externalId', 'sourceCategory']);
const numeric = new Set(['calories', 'protein', 'carbohydrates', 'fats', 'nutritionScore']);
const lists = new Set(['allergens', 'ingredients']);

function identity(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function catalogueKeyFor({ mealName, servingSize, dietaryPreference, source, externalId }) {
  if (!mealName || !servingSize || !dietaryPreference) throw new Error('Catalogue identity is incomplete');
  const keyParts = externalId ? [identity(source), identity(externalId)]
    : [identity(mealName), identity(servingSize), identity(dietaryPreference)];
  return `${externalId ? 'source' : 'fallback'}:${createHash('sha256')
    .update(JSON.stringify(keyParts)).digest('hex')}`;
}

function normalizeRow(input, fromCsv) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.has(key))) throw new Error('Unknown or invalid field');
  const row = { ...input };
  if (fromCsv) {
    for (const [key, value] of Object.entries(row)) {
      if (numeric.has(key)) {
        if (value === '' && !['calories', 'protein'].includes(key)) delete row[key];
        else if (!/^(?:\d+)(?:\.\d+)?$/.test(value)) throw new Error(`Invalid ${key}`);
        else row[key] = Number(value);
      } else if (lists.has(key)) row[key] = value ? value.split('|').map(item => item.trim()).filter(Boolean) : [];
      else row[key] = value.trim();
    }
    for (const key of ['source', 'externalId', 'allergenStatus', 'sourceCategory']) {
      if (row[key] === '') delete row[key];
    }
  }
  const source = row.source;
  const externalId = row.externalId;
  const sourceCategory = row.sourceCategory;
  if (source !== undefined && (typeof source !== 'string' || !source.trim() || source.length > 80)) throw new Error('Invalid source');
  if (externalId !== undefined && (typeof externalId !== 'string' || !externalId.trim() || externalId.length > 120 || !source)) {
    throw new Error('External ID requires a source');
  }
  if (sourceCategory !== undefined && (typeof sourceCategory !== 'string' ||
      !sourceCategory.trim() || sourceCategory.length > 80)) throw new Error('Invalid source category');
  delete row.source;
  delete row.externalId;
  delete row.sourceCategory;
  const data = validateMeal(row, true);
  if (!data.servingSize) throw new Error('Serving size is required for catalogue identity');
  if (data.allergens) data.allergens = normalizeAllergens(data.allergens);
  if (!data.allergenStatus) data.allergenStatus = 'unknown';
  const catalogueKey = catalogueKeyFor({ ...data, source, externalId });
  return { ...data, catalogueKey, ...(source ? { catalogueSource: source.trim() } : {}),
    ...(externalId ? { catalogueExternalId: externalId.trim() } : {}),
    ...(sourceCategory ? { catalogueSourceCategory: sourceCategory.trim() } : {}) };
}

function parseAndValidateMeals({ csv, meals } = {}) {
  const errors = [];
  if ((csv === undefined) === (meals === undefined)) return { rows: [], errors: [{ row: 0, message: 'Provide either csv or meals' }] };
  let input;
  let fromCsv = csv !== undefined;
  if (fromCsv) {
    if (typeof csv !== 'string' || !csv.trim() || Buffer.byteLength(csv) > 1_048_576) {
      return { rows: [], errors: [{ row: 0, message: 'CSV must be 1 MiB or smaller' }] };
    }
    try { input = parse(csv, { bom: true, skip_empty_lines: true }); }
    catch (error) { return { rows: [], errors: [{ row: error.lines || 0, message: 'Malformed CSV' }] }; }
    if (input.length < 2 || input.length > 501) return { rows: [], errors: [{ row: 0, message: 'CSV must contain 1 to 500 meals' }] };
    const names = input.shift().map(name => headers[name.trim()] || name.trim());
    if (new Set(names).size !== names.length || names.some(name => !fields.has(name)) ||
        ['mealName', 'cuisine', 'category', 'dietaryPreference', 'calories', 'protein', 'servingSize']
          .some(name => !names.includes(name))) {
      return { rows: [], errors: [{ row: 1, message: 'Missing, duplicate, or unknown CSV header' }] };
    }
    input = input.map((record, index) => {
      if (record.length !== names.length) {
        errors.push({ row: index + 2, message: 'Wrong number of columns' });
        return null;
      }
      return Object.fromEntries(names.map((name, column) => [name, record[column]]));
    });
  } else {
    if (!Array.isArray(meals) || !meals.length || meals.length > 500) {
      return { rows: [], errors: [{ row: 0, message: 'Meals must contain 1 to 500 rows' }] };
    }
    input = meals;
  }
  const rows = [];
  const seen = new Set();
  input.forEach((item, index) => {
    if (!item) {
      if (!fromCsv) errors.push({ row: index + 2, message: 'Invalid row' });
      return;
    }
    try {
      const row = normalizeRow(item, fromCsv);
      if (seen.has(row.catalogueKey)) throw new Error('Duplicate catalogue identity in file');
      seen.add(row.catalogueKey);
      rows.push(row);
    } catch (error) {
      errors.push({ row: index + 2, message: error.status === 400 ? error.message : error.message || 'Invalid row' });
    }
  });
  return { rows, errors };
}

function changed(existing, row) {
  return Object.entries(row).some(([key, value]) =>
    JSON.stringify(existing[key]) !== JSON.stringify(value));
}

async function importMeals(rows, { dryRun = false, retried = false } = {}) {
  if (await Meal.exists({ catalogueKey: { $exists: false } })) {
    const error = new Error('Catalogue migration required before import');
    error.status = 409;
    throw error;
  }
  const old = await Meal.find({ catalogueKey: { $in: rows.map(row => row.catalogueKey) } }).lean();
  const byKey = new Map(old.map(meal => [meal.catalogueKey, meal]));
  const pending = rows.filter(row => !byKey.has(row.catalogueKey) || changed(byKey.get(row.catalogueKey), row));
  const preview = { created: rows.filter(row => !byKey.has(row.catalogueKey)).length,
    updated: pending.filter(row => byKey.has(row.catalogueKey)).length,
    unchanged: rows.length - pending.length, rejected: 0, dryRun };
  if (dryRun || !pending.length) return preview;
  const now = new Date();
  const operations = pending.map(row => ({ updateOne: {
    filter: { catalogueKey: row.catalogueKey },
    update: { $set: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'catalogueKey')),
      $setOnInsert: { catalogueKey: row.catalogueKey, isActive: true,
        ratingSum: 0, totalRatings: 0, averageRating: 0, popularity: 0,
        createdAt: now } },
    upsert: true,
  } }));
  try {
    const result = await Meal.bulkWrite(operations, { ordered: true });
    return { created: result.upsertedCount, updated: result.modifiedCount,
      unchanged: rows.length - result.upsertedCount - result.modifiedCount,
      rejected: 0, dryRun: false };
  } catch (error) {
    if (error.code === 11000 && !retried) return importMeals(rows, { retried: true });
    const failure = new Error('Import may be partial; retry the same file safely');
    failure.status = 503;
    failure.code = 'partial_unknown';
    throw failure;
  }
}

module.exports = { parseAndValidateMeals, importMeals, catalogueKeyFor };
