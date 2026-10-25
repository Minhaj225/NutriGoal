import React, { useEffect, useState } from "react";
import { apiUtils } from "../../services/api";
import { readSession } from '../../services/session';

const MealCard = ({
  meal,
  onRate,
  onFeedback,
  showRating = true,
  showFeedback = false,
}) => {
  const [rating, setRating] = useState(0);
  const [isRating, setIsRating] = useState(false);
  const [isFeedback, setIsFeedback] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const resetForAccount = () => { setRating(0); setFeedback(null); setError(''); };
    window.addEventListener('adminLoginChange', resetForAccount);
    window.addEventListener('storage', resetForAccount);
    return () => {
      window.removeEventListener('adminLoginChange', resetForAccount);
      window.removeEventListener('storage', resetForAccount);
    };
  }, []);
  const servingSizeLabel = meal.servingSize?.trim() || "1 serving";
  const gramsMatch = servingSizeLabel.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  const proteinContext = gramsMatch
    ? `per ${gramsMatch[1]}g`
    : `per ${servingSizeLabel}`;

  const handleRating = async (newRating) => {
    if (readSession()?.role !== 'student') {
      setError('Sign in as a student to rate meals');
      return;
    }

    setIsRating(true);
    setError('');
    try {
      await onRate(meal._id, newRating);
      setRating(newRating);
    } catch (error) {
      setError(`Failed to submit rating: ${apiUtils.handleError(error)}`);
    } finally {
      setIsRating(false);
    }
  };

  const handleFeedback = async (liked) => {
    setIsFeedback(true);
    setError('');
    try {
      await onFeedback(meal._id, liked);
      setFeedback(liked);
    } catch (error) {
      setError(`Failed to save feedback: ${apiUtils.handleError(error)}`);
    } finally {
      setIsFeedback(false);
    }
  };

  const formattedMeal = apiUtils.formatMealData(meal);

  return (
    <article className="bg-surface rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border overflow-hidden hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] flex flex-col h-full text-text-primary">
      <div className="p-5 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-xl font-semibold leading-tight text-text-primary">
            {meal.mealName}
          </h3>
          {meal.confidence && (
            <div className="px-3 py-1 bg-primary-muted text-primary rounded-full text-xs font-medium whitespace-nowrap ml-2">
              {Math.round(meal.confidence * 100)}% match
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="bg-primary-muted text-primary rounded-full px-3 py-1 text-xs font-medium">
            {meal.cuisine}
          </span>
          <span className="bg-surface-alt text-text-secondary rounded-full px-3 py-1 text-xs">
            {meal.dietaryPreference}
          </span>
          <span className="bg-surface-alt text-text-muted rounded-full px-3 py-1 text-xs">
            {meal.category}
          </span>
        </div>

        <div className="text-sm text-text-secondary mb-4">
          <span className="font-semibold text-text-primary">Quantity:</span> {servingSizeLabel}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-surface-alt rounded-xl p-3">
            <div className="text-xs text-text-muted mb-1 uppercase tracking-wider font-medium">Calories</div>
            <div className="text-lg font-semibold text-text-primary">{meal.calories} <span className="text-sm font-normal text-text-muted">kcal</span></div>
          </div>
          <div className="bg-surface-alt rounded-xl p-3">
            <div className="text-xs text-text-muted mb-1 uppercase tracking-wider font-medium">Protein</div>
            <div className="text-lg font-semibold text-text-primary">{meal.protein} <span className="text-sm font-normal text-text-muted">g</span></div>
            <div className="text-xs text-text-muted mt-0.5">{proteinContext}</div>
          </div>
        </div>

        {meal.description && (
          <p className="text-sm text-text-secondary mb-4 line-clamp-2 flex-grow">
            {meal.description}
          </p>
        )}

        <div className="flex justify-between items-center mt-auto pt-4 border-t border-border">
          <div className="text-xs text-text-muted">
            {formattedMeal.ratingDisplay}
          </div>
          {meal.mlRecommended && (
            <div className="px-3 py-1 bg-primary-muted text-primary rounded-full text-xs font-medium">
              AI Recommended
            </div>
          )}
        </div>

        {showRating && (
          <div className="mt-4 flex flex-col items-center">
            <div className="flex items-center space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                  onClick={() => handleRating(star)}
                  disabled={isRating}
                  className={`focus:outline-none text-2xl transition-all active:scale-[0.90] ${
                    star <= (rating || meal.userRating || 0)
                      ? "text-warning hover:opacity-80"
                      : "text-border hover:text-text-muted"
                  } ${isRating ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  ★
                </button>
              ))}
              {isRating && (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary ml-2"></div>
              )}
            </div>
          </div>
        )}

        {showFeedback && <div className="mt-3 flex justify-center gap-3">
          <button type="button" disabled={isFeedback} onClick={() => handleFeedback(true)}
            className="rounded-full border border-border px-3 py-1 text-sm disabled:opacity-50">Like</button>
          <button type="button" disabled={isFeedback} onClick={() => handleFeedback(false)}
            className="rounded-full border border-border px-3 py-1 text-sm disabled:opacity-50">Dislike</button>
        </div>}

        {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}

        {feedback !== null && (
          <div className={`mt-3 p-2 rounded-lg text-xs text-center ${
            feedback 
              ? "bg-primary-muted text-primary" 
              : "bg-warning-muted text-warning"
          }`}>
            {feedback ? '👍 Preference saved' : '👎 Preference saved'}
          </div>
        )}
      </div>
    </article>
  );
};

export default MealCard;
