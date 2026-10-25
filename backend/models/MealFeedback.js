const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meal', required: true },
  rating: { type: Number, min: 1, max: 5 },
  liked: { type: Boolean, required: true },
  source: { type: String, enum: ['rating', 'explicit'], required: true },
  feedbackAt: { type: Date, default: Date.now },
  schemaVersion: { type: Number, default: 2 },
}, { timestamps: true });

schema.index({ studentId: 1, mealId: 1 }, { unique: true });
schema.index({ studentId: 1, feedbackAt: -1 });

module.exports = mongoose.model('MealFeedback', schema);
