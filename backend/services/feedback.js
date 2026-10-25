const mongoose = require('mongoose');
const Meal = require('../models/Meal');
const Student = require('../models/Student');
const MealFeedback = require('../models/MealFeedback');

function notFound(resource) {
  const error = new Error(`${resource} not found`);
  error.status = 404;
  throw error;
}

function reconcile(meal, difference, countDifference) {
  if (meal.ratingSummaryVersion !== 2) {
    meal.legacyRatingSummary = {
      averageRating: meal.averageRating,
      totalRatings: meal.totalRatings,
      popularity: meal.popularity,
    };
    meal.ratingSum = 0;
    meal.totalRatings = 0;
    meal.ratingSummaryVersion = 2;
  }
  meal.ratingSum += difference;
  meal.totalRatings += countDifference;
  meal.popularity = meal.totalRatings;
  meal.averageRating = meal.totalRatings ? meal.ratingSum / meal.totalRatings : 0;
}

async function transaction(work) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await work(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      const retryable = error.code === 11000 || error.code === 112 || error.code === 251 ||
        error.hasErrorLabel?.('TransientTransactionError') || error.hasErrorLabel?.('UnknownTransactionCommitResult');
      if (!retryable || attempt === 29) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(5 * (attempt + 1), 50)));
    } finally {
      await session.endSession();
    }
  }
}

async function recordMealFeedback({ studentId, mealId, rating, liked }) {
  return transaction(async session => {
    const meal = await Meal.findOne({ _id: mealId, isActive: true }).session(session);
    if (!meal) notFound('Meal');
    const student = await Student.findOne({ userId: studentId }).session(session);
    if (!student) notFound('Student profile');
    const existing = await MealFeedback.findOne({ studentId, mealId }).session(session);
    const ratingChanged = rating !== undefined && rating !== existing?.rating;
    if (existing && !ratingChanged && liked === undefined) {
      return { newAverageRating: meal.averageRating, totalRatings: meal.totalRatings,
        ratingSum: meal.ratingSum, liked: existing.liked, rating: existing.rating };
    }
    if (existing && liked !== undefined && existing.source === 'explicit' && existing.liked === liked) {
      return { newAverageRating: meal.averageRating, totalRatings: meal.totalRatings,
        ratingSum: meal.ratingSum, liked: existing.liked, rating: existing.rating };
    }
    if (ratingChanged) {
      reconcile(meal, rating - (existing?.rating || 0), existing?.rating === undefined ? 1 : 0);
      await meal.save({ session });
    }
    const feedback = existing || new MealFeedback({ studentId, mealId });
    if (rating !== undefined) feedback.rating = rating;
    feedback.liked = liked === undefined ? rating >= 4 : liked;
    feedback.source = liked === undefined ? 'rating' : 'explicit';
    feedback.feedbackAt = new Date();
    await feedback.save({ session });
    return { newAverageRating: meal.averageRating, totalRatings: meal.totalRatings,
      ratingSum: meal.ratingSum, liked: feedback.liked, rating: feedback.rating };
  });
}

async function deleteStudentProfile(studentId) {
  return transaction(async session => {
    const student = await Student.findOne({ userId: studentId }).session(session);
    if (!student) notFound('Student profile');
    const feedback = await MealFeedback.find({ studentId }).session(session);
    for (const entry of feedback) {
      if (entry.rating === undefined) continue;
      const meal = await Meal.findById(entry.mealId).session(session);
      if (!meal) continue;
      reconcile(meal, -entry.rating, -1);
      await meal.save({ session });
    }
    await MealFeedback.deleteMany({ studentId }).session(session);
    await Student.deleteOne({ _id: student._id }).session(session);
    return student;
  });
}

module.exports = { recordMealFeedback, deleteStudentProfile };
