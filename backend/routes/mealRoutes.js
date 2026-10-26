const express = require("express");
const router = express.Router();
const Meal = require("../models/Meal");
const Student = require("../models/Student");
const { recordMealFeedback } = require('../services/feedback');
const { buildEligibilityFilter } = require('../services/eligibility');
const axios = require("axios");
const { authenticateToken, authorizeAdmin, requireStudent } = require("../middleware/auth");
const { cuisines, categories, diets, email, id, integer, number, query, choice, invalid, keys, meal: validateMeal } = require('../validation');

const ML_API_URL = process.env.ML_API_URL || "http://localhost:5000";

// Simple in-memory cache for stats
let cachedStats = null;
let lastStatsCacheTime = 0;
const STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

    // Limit to top 100 candidates based on general popularity and rating to save memory and ML processing
    const meals = await Meal.find(mealFilter)
      .sort({ averageRating: -1, popularity: -1 })
      .limit(100);
    
    if (meals.length === 0) {
      return res.json({
        success: true,
        message: student.allergies?.length ? 'No verified meals match your allergy and profile filters' : 'No meals found matching your preferences',
        recommendations: [],
        excludedUnknownAllergenCount
      });
    }

    // Prepare meals for ML prediction
    const mealPredictions = meals.map(meal => ({
      meal_name: meal.mealName,
      calories: meal.calories,
      protein: meal.protein,
      cuisine: meal.cuisine,
      category: meal.category,
      diet: meal.dietaryPreference
    }));

    // Get recommendations from ML API
    let recommendations = [];
    try {
      const mlResponse = await axios.post(`${ML_API_URL}/predict_batch`, {
        meals: mealPredictions
      }, {
        timeout: 10000
      });

      if (mlResponse.data.success !== false && mlResponse.data.results) {
        // Filter recommended meals
        const recommendedMeals = [];
        
        mlResponse.data.results.forEach((result, index) => {
          if (result.recommended && result.confidence > 0.5) {
            recommendedMeals.push({
              ...meals[index].toObject(),
              confidence: result.confidence,
              mlRecommended: true
            });
          }
        });

        // Sort by confidence and rating
        recommendations = recommendedMeals
          .sort((a, b) => (b.confidence * 0.7 + b.averageRating * 0.3) - (a.confidence * 0.7 + a.averageRating * 0.3))
          .slice(0, limit);
      }
    } catch (mlError) {
      console.error("ML API Error:", mlError.message);
      // Fallback: return meals sorted by rating and popularity
      recommendations = meals
        .sort((a, b) => (b.averageRating * 0.6 + b.popularity * 0.4) - (a.averageRating * 0.6 + a.popularity * 0.4))
        .slice(0, limit)
        .map(meal => ({
          ...meal.toObject(),
          confidence: 0.5,
          mlRecommended: false,
          fallbackRecommendation: true
        }));
    }

    res.json({
      success: true,
      recommendations,
      studentPreferences: student.preferences,
      totalMealsEvaluated: meals.length,
      mlApiUsed: recommendations.length > 0 ? recommendations[0].mlRecommended : false,
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
router.post("/:id/rate", authenticateToken, requireStudent, async (req, res, next) => {
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
    const { meals } = req.body;
    
    keys(req.body, ['meals']);
    if (!Array.isArray(meals) || meals.length === 0 || meals.length > 100) invalid('Meals array must contain 1 to 100 entries');

    const importedMeals = await Meal.insertMany(meals.map(item => validateMeal(item, true)), { ordered: false });
    
    res.json({
      success: true,
      message: `${importedMeals.length} meals imported successfully`,
      importedCount: importedMeals.length
    });
  } catch (err) { next(err); }
});

module.exports = router;
