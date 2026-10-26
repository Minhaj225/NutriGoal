const { normalizeAllergens } = require('./allergens');

function buildEligibilityFilter(student, { mealType } = {}) {
  const filter = { isActive: true };
  const preferences = student.preferences || {};
  if (preferences.dietaryPreference) filter.dietaryPreference = preferences.dietaryPreference;
  if (preferences.cuisines?.length) filter.cuisine = { $in: preferences.cuisines };
  if (preferences.categories?.length) filter.category = { $in: preferences.categories };
  if (mealType) {
    if (preferences.categories?.length && !preferences.categories.includes(mealType)) filter._id = { $in: [] };
    else filter.category = mealType;
  }
  if (student.nutritionGoals?.maxCaloriesPerMeal !== undefined) {
    filter.calories = { $lte: student.nutritionGoals.maxCaloriesPerMeal };
  }
  if (student.nutritionGoals?.minProteinPerMeal !== undefined) {
    filter.protein = { $gte: student.nutritionGoals.minProteinPerMeal };
  }
  if (student.allergies?.length) {
    filter.allergenStatus = 'verified';
    filter.allergens = { $exists: true, $nin: normalizeAllergens(student.allergies) };
  }
  return filter;
}

module.exports = { buildEligibilityFilter };
