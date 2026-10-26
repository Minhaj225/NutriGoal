function evidence(meal) {
  const count = meal.ratingSummaryVersion === 2 && Number.isFinite(meal.totalRatings)
    ? Math.max(0, meal.totalRatings) : 0;
  const sum = count && Number.isFinite(meal.ratingSum)
    ? Math.min(5 * count, Math.max(0, meal.ratingSum)) : 0;
  return { count, ratingNorm: (sum + 15) / (5 * (count + 5)) };
}

function sortRanked(rows, limit) {
  return rows.sort((a, b) => b.rankingScore - a.rankingScore ||
    String(a._id).localeCompare(String(b._id))).slice(0, limit);
}

function baselineRank(meals, limit) {
  const maxCount = Math.max(0, ...meals.map(meal => evidence(meal).count));
  return sortRanked(meals.map(meal => {
    const { count, ratingNorm } = evidence(meal);
    const popularityNorm = maxCount ? Math.log1p(count) / Math.log1p(maxCount) : 0;
    return { ...meal.toObject(), rankingScore: 0.6 * ratingNorm + 0.4 * popularityNorm,
      confidence: null, mlRecommended: false };
  }), limit);
}

function validatePredictions(body, meals) {
  if (body?.success !== true || typeof body.modelVersion !== 'string' || !body.modelVersion ||
      !Array.isArray(body.results) || body.results.length !== meals.length) {
    throw new Error('Invalid model response');
  }
  const requested = new Set(meals.map(meal => String(meal._id)));
  const predictions = new Map();
  for (const item of body.results) {
    if (!item || !requested.has(item.meal_id) || predictions.has(item.meal_id) ||
        item.error !== undefined || typeof item.recommended !== 'boolean' ||
        typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) ||
        item.confidence < 0 || item.confidence > 1) throw new Error('Invalid model result');
    predictions.set(item.meal_id, item);
  }
  return predictions;
}

function behavioralRank(meals, predictions, limit) {
  return sortRanked(meals.filter(meal => predictions.get(String(meal._id))?.recommended).map(meal => {
    const confidence = predictions.get(String(meal._id)).confidence;
    return { ...meal.toObject(), confidence,
      rankingScore: 0.7 * confidence + 0.3 * evidence(meal).ratingNorm, mlRecommended: true };
  }), limit);
}

module.exports = { baselineRank, behavioralRank, validatePredictions };
