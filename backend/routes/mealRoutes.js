const express = require("express");
const router = express.Router();
const Meal = require("../models/Meal");
const Student = require("../models/Student");
const { recordMealFeedback } = require('../services/feedback');
const { buildEligibilityFilter } = require('../services/eligibility');
const { baselineRank, behavioralRank, validatePredictions } = require('../services/recommendations');
const { parseAndValidateMeals, importMeals } = require('../services/catalogueImport');
const axios = require("axios");
const { authenticateToken, authorizeAdmin, requireStudent } = require("../middleware/auth");
const { cuisines, categories, diets, email, id, integer, number, query, choice, invalid, keys, meal: validateMeal } = require('../validation');

const ML_API_URL = process.env.ML_API_URL || "http://localhost:5000";

// Simple in-memory cache for stats
let cachedStats = null;
let lastStatsCacheTime = 0;
const STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get('/ml/features', authenticateToken, authorizeAdmin, async (_req, res) => {
  if (!process.env.ML_API_TOKEN) return res.status(503).json({ error: 'model_unavailable' });
  try {
    const response = await axios.get(`${ML_API_URL}/features`, {
      headers: { 'X-ML-Token': process.env.ML_API_TOKEN },
      timeout: 2500, maxContentLength: 1000000,
    });
    if (!Array.isArray(response.data?.features) || response.data.features.length > 100 ||
        response.data.features.some(feature => typeof feature !== 'string' || feature.length > 100) ||
        typeof response.data.modelVersion !== 'string') throw new Error('Invalid model metadata');
    return res.json({ features: response.data.features, modelVersion: response.data.modelVersion });
  } catch {
    return res.status(503).json({ error: 'model_unavailable' });
  }
});

// Get meal statistics
router.get("/stats", async (req, res, next) => {
  try {
    const now = Date.now();
    if (cachedStats && (now - lastStatsCacheTime < STATS_CACHE_TTL)) {
      return res.json({ success: true, stats: cachedStats });
    }

    const stats = await Meal.aggregate([
      { $match: { isActive: true } },
      {
        $facet: {
          total: [{ $count: "count" }],
          cuisines: [{ $group: { _id: "$cuisine" } }],
          categories: [{ $group: { _id: "$category" } }],
          avgRating: [{ $group: { _id: null, avg: { $avg: "$averageRating" } } }],
          topCuisine: [
            { $group: { _id: "$cuisine", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
          ],
        },
      },
    ]);

    const total = stats[0].total[0]?.count || 0;
    const cuisineCount = stats[0].cuisines.length;
    const categoryCount = stats[0].categories.length;
    const averageRating = stats[0].avgRating[0]?.avg || 0;
    const topCuisine = stats[0].topCuisine[0]?._id || "N/A";

    cachedStats = {
      totalMeals: total,
      cuisineCount,
      categoryCount,
      averageRating,
      topCuisine,
    };
    lastStatsCacheTime = now;

    res.json({
      success: true,
      stats: cachedStats,
    });
  } catch (err) { next(err); }
});

// Create a meal entry
router.post("/", authenticateToken, authorizeAdmin, async (req, res, next) => {
  try {
    const meal = new Meal(validateMeal(req.body, true));
    await meal.save();
    
    res.json({
      success: true,
      message: "Meal created successfully",
      meal
    });
  } catch (err) { next(err); }
});

// Get all meals with filtering
router.get("/", async (req, res, next) => {
  try {
    const options = query(req, {
      cuisine: value => choice(value, cuisines),
      category: value => choice(value, categories),
      dietaryPreference: value => choice(value, diets),
      minCalories: value => number(value),
      maxCalories: value => number(value),
      minProtein: value => number(value),
      sortBy: value => choice(value, ['popularity', 'rating', 'calories', 'protein']),
      page: value => integer(value, 1, 1000000),
      limit: value => integer(value, 1, 100),
    });
    const { cuisine, category, dietaryPreference, minCalories, maxCalories, minProtein } = options;
    const sortBy = options.sortBy || 'popularity';
    const pageNum = options.page || 1;
    const limitNum = options.limit || 20;
    if (minCalories !== undefined && maxCalories !== undefined && minCalories > maxCalories) invalid('Minimum calories exceeds maximum');
    
    let filter = { isActive: true };
    
    if (cuisine) filter.cuisine = cuisine;
    if (category) filter.category = category;
    if (dietaryPreference) filter.dietaryPreference = dietaryPreference;
    if (minCalories !== undefined) filter.calories = { ...filter.calories, $gte: minCalories };
    if (maxCalories !== undefined) filter.calories = { ...filter.calories, $lte: maxCalories };
    if (minProtein !== undefined) filter.protein = { $gte: minProtein };
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {
      popularity: { popularity: -1, averageRating: -1 },
      rating: { averageRating: -1 },
      calories: { calories: 1 },
      protein: { protein: -1 },
    };
    const sort = sortOptions[sortBy] || sortOptions.popularity;

    const total = await Meal.countDocuments(filter);
    const meals = await Meal.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);
    
    res.json({
      success: true,
      count: meals.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      meals
    });
  } catch (err) { next(err); }
});

// Get meal by ID
router.get("/:id", async (req, res, next) => {
  try {
    const meal = await Meal.findById(id(req.params.id));
    
    if (!meal || !meal.isActive) {
      return res.status(404).json({ error: "Meal not found" });
    }
    
    res.json({
      success: true,
      meal
    });
  } catch (err) { next(err); }
});

// Recommend meals for a student using enhanced ML API
const recommend = async (req, res, next) => {
  try {
    const options = query(req, {
      limit: value => integer(value, 1, 20),
      mealType: value => choice(value, categories),
    });
    const limit = options.limit || 10;
    const mealType = options.mealType;
    
    // Get student profile
    const student = req.user.role === 'student'
      ? await Student.findOne({ userId: req.user.id })
      : await Student.findOne({ email: req.params.email });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const mealFilter = buildEligibilityFilter(student, { mealType });
    let excludedUnknownAllergenCount = 0;
    if (student.allergies?.length) {
      const { allergenStatus, allergens, ...otherwiseEligible } = mealFilter;
      excludedUnknownAllergenCount = await Meal.countDocuments({ ...otherwiseEligible,
        $or: [{ allergenStatus: { $ne: 'verified' } }, { allergens: { $exists: false } }] });
    }

    // shortcut: score at most 500 candidates, use measured retrieval when catalogues routinely exceed this bound.
    const meals = await Meal.find(mealFilter).limit(501);
    if (meals.length > 500) {
      return res.status(422).json({ error: 'narrow_preferences',
        message: 'More than 500 meals match. Narrow your profile or meal type.' });
    }
    const totalEligible = meals.length;
    const requestedMode = process.env.RECOMMENDER_MODE || 'baseline';
    const modelConfigured = !!(process.env.ML_API_TOKEN && process.env.ML_MODEL_VERSION);
    const degradedReason = requestedMode === 'behavioral'
      ? process.env.BEHAVIORAL_MODEL_APPROVED === 'true' ? 'not_configured' : 'not_approved'
      : null;
    
    if (meals.length === 0) {
      return res.json({
        success: true,
        message: student.allergies?.length ? 'No verified meals match your allergy and profile filters' : 'No meals found matching your preferences',
        recommendations: [],
        excludedUnknownAllergenCount,
        recommendationMode: 'baseline', degradedReason, modelVersion: null,
        totalEligible: 0, totalMealsEvaluated: 0, mlApiUsed: false,
      });
    }

    let recommendations = baselineRank(meals, limit);
    let recommendationMode = 'baseline';
    let reason = degradedReason;
    let modelVersion = null;
    if (requestedMode === 'behavioral' && process.env.BEHAVIORAL_MODEL_APPROVED === 'true' && modelConfigured) {
      try {
        const mlResponse = await axios.post(`${ML_API_URL}/predict_batch`, {
          schemaVersion: 'behavioral-v1', modelVersion: process.env.ML_MODEL_VERSION,
          meals: meals.map(meal => ({ meal_id: String(meal._id), meal_name: meal.mealName,
            calories: meal.calories, protein: meal.protein, cuisine: meal.cuisine,
            category: meal.category, diet: meal.dietaryPreference })),
        }, { headers: { 'X-ML-Token': process.env.ML_API_TOKEN },
          timeout: 2500, maxContentLength: 1_000_000, maxBodyLength: 1_000_000 });
        if (mlResponse.data?.modelVersion !== process.env.ML_MODEL_VERSION) throw new Error('Wrong model version');
        const predictions = validatePredictions(mlResponse.data, meals);
        const ranked = behavioralRank(meals, predictions, limit);
        if (ranked.length) {
          recommendations = ranked;
          recommendationMode = 'behavioral';
          reason = null;
          modelVersion = mlResponse.data.modelVersion;
        } else reason = 'no_positive_predictions';
      } catch (error) {
        reason = error.code === 'ECONNABORTED' || error.response || error.request
          ? 'model_unavailable' : 'invalid_model_response';
      }
    }

    res.json({
      success: true,
      recommendations,
      studentPreferences: student.preferences,
      totalEligible,
      totalMealsEvaluated: meals.length,
      recommendationMode, degradedReason: reason, modelVersion,
      mlApiUsed: recommendationMode === 'behavioral',
      excludedUnknownAllergenCount
    });

  } catch (err) { next(err); }
};

router.get('/recommend/me', authenticateToken, requireStudent, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return recommend(req, res, next);
});
router.get('/recommend/:email', authenticateToken, (req, res, next) => {
  try {
    const target = email(req.params.email);
    if (req.user.role !== 'admin' && (req.user.role !== 'student' || req.user.email !== target)) {
      return res.status(403).json({ error: 'Profile belongs to another account' });
    }
    req.params.email = target;
    res.set('Cache-Control', 'no-store');
    return recommend(req, res, next);
  } catch (err) { next(err); }
});

// Rate a meal
router.post("/:id/rate", authenticateToken, requireStudent,
  (req, res, next) => req.app.locals.rateLimits.feedback(req, res, next),
  async (req, res, next) => {
  try {
    keys(req.body, ['rating']);
    const { rating } = req.body;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) invalid('Rating must be an integer between 1 and 5');
    const mealId = id(req.params.id);
    const result = await recordMealFeedback({ studentId: req.user.id, mealId, rating });

    res.json({
      success: true,
      message: "Rating recorded successfully",
      ...result
    });
  } catch (err) { next(err); }
});

// Update meal
router.put("/:id", authenticateToken, authorizeAdmin, async (req, res, next) => {
  try {
    const updateData = validateMeal(req.body, false);
    if (updateData.servingSize !== undefined && updateData.allergenStatus === undefined) {
      const current = await Meal.findById(id(req.params.id));
      if (current?.allergenStatus === 'verified') {
        validateMeal({ allergenStatus: 'verified', allergens: current.allergens,
          servingSize: updateData.servingSize }, false);
      }
    }

    const meal = await Meal.findByIdAndUpdate(
      id(req.params.id),
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!meal) {
      return res.status(404).json({ error: "Meal not found" });
    }
    
    res.json({
      success: true,
      message: "Meal updated successfully",
      meal
    });
  } catch (err) { next(err); }
});

// Delete meal
router.delete("/:id", authenticateToken, authorizeAdmin, async (req, res, next) => {
  try {
    const meal = await Meal.findByIdAndUpdate(
      id(req.params.id),
      { isActive: false },
      { new: true }
    );
    
    if (!meal) {
      return res.status(404).json({ error: "Meal not found" });
    }
    
    res.json({
      success: true,
      message: "Meal deleted successfully"
    });
  } catch (err) { next(err); }
});

// Bulk import meals from CSV data
router.post("/bulk-import", authenticateToken, authorizeAdmin, async (req, res, next) => {
  try {
    keys(req.body, ['csv', 'meals', 'dryRun']);
    if (req.body.dryRun !== undefined && typeof req.body.dryRun !== 'boolean') invalid('Invalid dryRun');
    const { rows, errors } = parseAndValidateMeals(req.body);
    if (errors.length) return res.status(400).json({ error: 'invalid_import', rowErrors: errors,
      created: 0, updated: 0, unchanged: 0, rejected: errors.length });
    const result = await importMeals(rows, { dryRun: req.body.dryRun === true });
    return res.json({ success: true, ...result, importedCount: result.created,
      message: `${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged` });
  } catch (error) {
    if (error.code === 'partial_unknown') return res.status(503).json({ error: error.code,
      message: error.message, state: 'partial_or_unknown' });
    if (error.status === 409) return res.status(409).json({ error: 'migration_required', message: error.message });
    return next(error);
  }
});

module.exports = router;
