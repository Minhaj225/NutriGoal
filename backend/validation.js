const cuisines = ['North Indian', 'South Indian', 'Street Food', 'General'];
const categories = ['Main Dish', 'Breakfast', 'Snack', 'Side Dish', 'Staple'];
const diets = ['Vegetarian', 'Non-Vegetarian'];
const { uncertainAllergen } = require('./services/allergens');

function invalid(message = 'Invalid request') {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid();
}

function string(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`Invalid ${label}`);
  return value.trim();
}

function email(value) {
  const normalized = string(value, 254, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) invalid('Invalid email');
  return normalized;
}

function emailPattern(value) {
  const escaped = email(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}\\s*$`, 'i');
}

function id(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) invalid('Invalid ID');
  return value;
}

function integer(value, min, max) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) invalid('Invalid integer');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) invalid('Integer out of range');
  return result;
}

function number(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'string' || !/^(?:\d+)(?:\.\d+)?$/.test(value)) invalid('Invalid number');
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) invalid('Number out of range');
  return result;
}

function query(req, spec) {
  const params = new URL(req.originalUrl, 'http://localhost').searchParams;
  const result = {};
  for (const [key, value] of params) {
    if (!Object.hasOwn(spec, key) || Object.hasOwn(result, key)) invalid('Invalid query parameter');
    result[key] = spec[key](value);
  }
  return result;
}

function choice(value, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid('Invalid option');
  return value;
}

function list(value, allowed) {
  if (!Array.isArray(value) || value.length > 30) invalid('Invalid list');
  return value.map(item => {
    const cleaned = string(item, 80, 'list item');
    return allowed ? choice(cleaned, allowed) : cleaned;
  });
}

function profile(body, ownEmail, creating) {
  keys(body, ['name', 'email', 'preferences', 'nutritionGoals', 'allergies', 'activityLevel']);
  if (body.email !== undefined && email(body.email) !== ownEmail) invalid('Email does not match account');
  if (creating && body.name === undefined) invalid('Name is required');
  const update = {};
  if (body.name !== undefined) update.name = string(body.name, 120, 'name');
  if (body.activityLevel !== undefined) update.activityLevel = choice(body.activityLevel, ['Low', 'Moderate', 'High']);
  if (body.allergies !== undefined) update.allergies = list(body.allergies);
  if (body.preferences !== undefined) {
    keys(body.preferences, ['cuisines', 'dietaryPreference', 'categories']);
    if (body.preferences.cuisines !== undefined) update['preferences.cuisines'] = list(body.preferences.cuisines, cuisines);
    if (body.preferences.categories !== undefined) update['preferences.categories'] = list(body.preferences.categories, categories);
    if (body.preferences.dietaryPreference !== undefined) update['preferences.dietaryPreference'] = choice(body.preferences.dietaryPreference, diets);
  }
  if (body.nutritionGoals !== undefined) {
    const ranges = { caloriesPerDay: [1000, 5000], proteinGramsPerDay: [20, 200], maxCaloriesPerMeal: [100, 1000], minProteinPerMeal: [5, 50] };
    keys(body.nutritionGoals, Object.keys(ranges));
    for (const [key, value] of Object.entries(body.nutritionGoals)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < ranges[key][0] || value > ranges[key][1]) invalid(`Invalid ${key}`);
      update[`nutritionGoals.${key}`] = value;
    }
  }
  return update;
}

function meal(body, creating) {
  const allowed = ['mealName', 'cuisine', 'category', 'dietaryPreference', 'calories', 'protein', 'carbohydrates', 'fats', 'servingSize', 'allergens', 'ingredients', 'description', 'imageUrl', 'isActive', 'nutritionScore', 'allergenStatus'];
  keys(body, allowed);
  const result = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'mealName') result[key] = string(value, 120, key);
    else if (['servingSize', 'description', 'imageUrl'].includes(key)) {
      const max = key === 'servingSize' ? 120 : 2000;
      if (typeof value !== 'string' || value.trim().length > max) invalid(`Invalid ${key}`);
      result[key] = value.trim();
    }
    else if (key === 'cuisine') result[key] = choice(value, cuisines);
    else if (key === 'category') result[key] = choice(value, categories);
    else if (key === 'dietaryPreference') result[key] = choice(value, diets);
    else if (key === 'allergenStatus') result[key] = choice(value, ['unknown', 'verified']);
    else if (['allergens', 'ingredients'].includes(key)) result[key] = list(value);
    else if (key === 'isActive') {
      if (typeof value !== 'boolean') invalid('Invalid isActive');
      result[key] = value;
    } else if (!creating && ['carbohydrates', 'fats'].includes(key) && value === null) {
      result[key] = null;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (key === 'nutritionScore' && value > 10)) invalid(`Invalid ${key}`);
      result[key] = value;
    }
  }
  if (creating && ['mealName', 'cuisine', 'category', 'dietaryPreference', 'calories', 'protein'].some(key => result[key] === undefined)) {
    invalid('Missing meal fields');
  }
  if (result.allergens && result.allergenStatus === undefined) result.allergenStatus = 'unknown';
  if (result.allergenStatus === 'verified') {
    if (!Array.isArray(result.allergens) || result.allergens.some(uncertainAllergen) ||
        !/^(?:\d+(?:\.\d+)?\s*(?:g|ml)|\d+(?:\.\d+)?\s*(?:bowl|cup|piece)s?\s*\(\d+(?:\.\d+)?\s*(?:g|ml)\))$/i.test(result.servingSize || '')) {
      invalid('Verified allergen metadata requires a complete allergen list and measured serving size');
    }
  }
  return result;
}

module.exports = { cuisines, categories, diets, invalid, keys, string, email, emailPattern, id, integer, number, query, choice, profile, meal };
