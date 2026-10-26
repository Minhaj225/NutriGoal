const mongoose = require("mongoose");
const { normalizeAllergens } = require('../services/allergens');

const mealSchema = new mongoose.Schema({
  mealName: { type: String, required: true },
  catalogueKey: String,
  catalogueSource: String,
  catalogueExternalId: String,
  cuisine: { 
    type: String, 
    required: true,
    enum: ["North Indian", "South Indian", "Street Food", "General"]
  },
  category: { 
    type: String, 
    required: true,
    enum: ["Main Dish", "Breakfast", "Snack", "Side Dish", "Staple"]
  },
  calories: { type: Number, required: true, min: 0 },
  protein: { type: Number, required: true, min: 0 },
  carbohydrates: { type: Number, min: 0 },
  fats: { type: Number, min: 0 },
  dietaryPreference: { 
    type: String, 
    required: true,
    enum: ["Vegetarian", "Non-Vegetarian"]
  },
  servingSize: String,
  allergens: { type: [String], default: [], set: normalizeAllergens },
  allergenStatus: { type: String, enum: ['unknown', 'verified'], default: 'unknown' },
  ingredients: [String],
  description: String,
  imageUrl: String,
  isActive: { type: Boolean, default: true },
  nutritionScore: { type: Number, min: 0, max: 10 },
  popularity: { type: Number, default: 0 },
  ratingSum: { type: Number, default: 0 },
  ratingSummaryVersion: Number,
  legacyRatingSummary: {
    averageRating: Number,
    totalRatings: Number,
    popularity: Number,
  },
  averageRating: { type: Number, min: 0, max: 5, default: 0 },
  totalRatings: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Index for better query performance
mealSchema.index({ cuisine: 1, category: 1, dietaryPreference: 1 });
mealSchema.index({ calories: 1, protein: 1 });
mealSchema.index({ popularity: -1, averageRating: -1 });
mealSchema.index({ averageRating: -1 });
mealSchema.index({ protein: -1 });
// New imports are unique while legacy rows without keys await the Task 12 migration.
mealSchema.index({ catalogueKey: 1 }, { unique: true,
  partialFilterExpression: { catalogueKey: { $type: 'string' } } });

module.exports = mongoose.model("Meal", mealSchema);
