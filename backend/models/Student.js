const mongoose = require("mongoose");
const { normalizeAllergens } = require('../services/allergens');

const studentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  preferences: {
    cuisines: [{ type: String, enum: ["North Indian", "South Indian", "Street Food", "General"] }],
    dietaryPreference: { type: String, enum: ["Vegetarian", "Non-Vegetarian"], default: "Vegetarian" },
    categories: [{ type: String, enum: ["Main Dish", "Breakfast", "Snack", "Side Dish", "Staple"] }]
  },
  allergies: { type: [{ type: String, maxlength: 80 }], default: [], set: normalizeAllergens },
  nutritionGoals: {
    caloriesPerDay: { type: Number, min: 1000, max: 5000 },
    proteinGramsPerDay: { type: Number, min: 20, max: 200 },
    maxCaloriesPerMeal: { type: Number, min: 100, max: 1000 },
    minProteinPerMeal: { type: Number, min: 5, max: 50 }
  },
  activityLevel: { type: String, enum: ["Low", "Moderate", "High"], default: "Moderate" },
  mealHistory: [{
    mealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meal' },
    liked: Boolean,
    consumedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

studentSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });

module.exports = mongoose.model("Student", studentSchema);
