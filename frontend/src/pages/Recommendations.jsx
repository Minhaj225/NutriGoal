import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { mealAPI, studentAPI, apiUtils } from "../services/api";
import MealCard from "../components/meals/MealCard";
import Skeleton from "../components/common/Skeleton";
import ErrorMessage from "../components/common/ErrorMessage";
import { useStaggeredEntry } from "../hooks/useStaggeredEntry";
import { readSession } from '../services/session';

const Recommendations = () => {
  const [session, setSession] = useState(readSession);
  const email = session?.email || '';
  const token = session?.token;
  const request = useRef(null);
  const successTimer = useRef(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [excludedUnknownAllergenCount, setExcludedUnknownAllergenCount] = useState(0);
  const [recommendationInfo, setRecommendationInfo] = useState(null);
  const [student, setStudent] = useState(null);
  const [filters, setFilters] = useState({
    limit: 10,
    mealType: "",
  });

  const gridRef = useStaggeredEntry([recommendations]);

  useEffect(() => {
    const update = () => setSession(readSession());
    window.addEventListener('adminLoginChange', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('adminLoginChange', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request.current?.abort();
    clearTimeout(successTimer.current);
    setRecommendations([]);
    setRecommendationInfo(null);
    setStudent(null);
    setError('');
    setSuccess('');
    setLoading(false);
    if (token) studentAPI.getProfile(controller.signal).then(response => {
      if (!controller.signal.aborted && response.success) setStudent(response.student);
    }, error => {
      if (!controller.signal.aborted && error.response?.status !== 404) setError(apiUtils.handleError(error));
    });
    return () => {
      controller.abort();
      request.current?.abort();
      clearTimeout(successTimer.current);
    };
  }, [token]);

  const fetchRecommendations = async () => {
    if (!student) {
      setError('Create your profile before requesting recommendations');
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setExcludedUnknownAllergenCount(0);
    setRecommendationInfo(null);
    setRecommendations([]);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    try {
      const response = await mealAPI.getRecommendations(filters, controller.signal);
      if (controller.signal.aborted || readSession()?.token !== token) return;

      if (response.success && Array.isArray(response.recommendations)) {
        setRecommendations(response.recommendations);
        setExcludedUnknownAllergenCount(response.excludedUnknownAllergenCount || 0);
        setRecommendationInfo(response);

        if (response.recommendations.length === 0) {
          setError(response.message || "No meals match your profile filters.");
        }
      } else {
        setError("Failed to get recommendations");
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(apiUtils.handleError(error));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleRating = async (mealId, rating) => {
    if (readSession()?.token !== token) throw new Error('Account changed; reload recommendations');
    const saved = await mealAPI.rateMeal(mealId, rating);
    if (readSession()?.token !== token) return saved;
      setRecommendations((prev) =>
        prev.map((meal) =>
          meal._id === mealId ? { ...meal, userRating: rating, averageRating: saved.newAverageRating,
            totalRatings: saved.totalRatings, ratingSum: saved.ratingSum } : meal
        )
      );
      setSuccess(`✅ Rating submitted! You gave ${rating} star${rating !== 1 ? "s" : ""}.`);
      setError("");
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 3000);
    return saved;
  };

  const handleFeedback = async (mealId, liked) => {
    try {
      if (readSession()?.token !== token) throw new Error('Account changed; reload recommendations');
      const saved = await studentAPI.recordFeedback(mealId, liked);
      if (readSession()?.token !== token) return saved;
      setRecommendations((prev) =>
        prev.map((meal) =>
          meal._id === mealId ? { ...meal, userFeedback: liked } : meal
        )
      );
      setSuccess(`✅ Feedback recorded! You ${liked ? "liked" : "disliked"} this meal.`);
      setError("");
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 3000);
      return saved;
    } catch (error) {
      console.error("Failed to record feedback:", error);
      setError(`Failed to record feedback: ${apiUtils.handleError(error)}`);
      setSuccess("");
      throw error;
    }
  };

  const handleFilterChange = (field, value) => {
    request.current?.abort();
    setRecommendations([]);
    setRecommendationInfo(null);
    setLoading(false);
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const categoryOptions = ["", "Main Dish", "Breakfast", "Snack", "Side Dish", "Staple"];

  return (
    <main className="min-h-screen bg-background py-24 md:py-32 text-text-primary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Page Header */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-text-primary mb-2">
            Personalized Recommendations
          </h1>
          <p className="text-text-secondary max-w-lg">
            Find meals using your diet, cuisines, meal types, allergies, and per-meal limits.
          </p>
        </div>

        {/* Account and filters */}
        <section className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 md:p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Signed in as
              </label>
              <div className="w-full bg-surface-alt border border-border rounded-lg px-4 py-3 text-text-primary">{email}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Meal Type
              </label>
              <select
                value={filters.mealType}
                onChange={(e) => handleFilterChange("mealType", e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors appearance-none"
              >
                <option value="">All Types</option>
                {categoryOptions.slice(1).map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Results
              </label>
              <select
                value={filters.limit}
                onChange={(e) => handleFilterChange("limit", parseInt(e.target.value))}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors appearance-none"
              >
                <option value={5}>5 meals</option>
                <option value={10}>10 meals</option>
                <option value={15}>15 meals</option>
                <option value={20}>20 meals</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <button
              onClick={fetchRecommendations}
              className="bg-primary text-white rounded-full px-8 py-3 font-medium hover:bg-primary-hover transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !student}
            >
              {loading ? "Getting Recommendations..." : "Get My Recommendations"}
            </button>
          </div>
        </section>

        {/* Student Profile Summary */}
        {student && (
          <section className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 mb-8">
            <div className="flex justify-between items-start mb-5">
              <h3 className="text-lg font-semibold text-text-primary">Your Profile</h3>
              <Link
                to="/profile"
                className="text-sm font-medium text-primary hover:text-primary-hover transition-colors"
              >
                Edit →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div className="space-y-2">
                <p><span className="text-text-muted">Name:</span> {student.name}</p>
                <p><span className="text-text-muted">Diet:</span> {student.preferences?.dietaryPreference}</p>
              </div>
              <div className="space-y-2">
                <p><span className="text-text-muted">Cuisines:</span> {student.preferences?.cuisines?.join(", ") || "All"}</p>
                <p><span className="text-text-muted">Activity:</span> {student.activityLevel}</p>
              </div>
              <div className="space-y-2">
                <p><span className="text-text-muted">Daily Cal:</span> <span className="font-mono text-text-primary">{student.nutritionGoals?.caloriesPerDay}</span></p>
                <p><span className="text-text-muted">Daily Protein:</span> <span className="font-mono text-text-primary">{student.nutritionGoals?.proteinGramsPerDay}g</span></p>
              </div>
            </div>
          </section>
        )}

        {/* Error Display */}
        {error && <ErrorMessage message={error} onRetry={fetchRecommendations} />}
        {excludedUnknownAllergenCount > 0 && (
          <p role="status" className="bg-warning-muted border border-warning/20 rounded-lg p-4 mb-8 text-sm text-text-secondary">
            {excludedUnknownAllergenCount} otherwise matching meal{excludedUnknownAllergenCount === 1 ? '' : 's'} excluded because allergen information is unverified.
          </p>
        )}
        {recommendationInfo?.degradedReason && recommendationInfo.degradedReason !== 'not_approved' && (
          <p role="status" className="bg-warning-muted border border-warning/20 rounded-lg p-4 mb-8 text-sm text-text-secondary">
            The model is unavailable or returned no usable picks. Showing the eligible meals ranked by verified crowd ratings instead.
          </p>
        )}

        {/* Success Display */}
        {success && (
          <div className="bg-success/10 text-success rounded-lg p-3 flex items-center mb-8 text-sm font-medium">
            <svg className="w-4 h-4 mr-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-12">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="card" />
            ))}
          </div>
        )}

        {/* No Profile Warning */}
        {email && !student && !loading && (
          <div className="bg-warning-muted border border-warning/20 rounded-lg p-4 flex items-start justify-between mb-8">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L5.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm text-text-secondary">Create your profile first for personalized recommendations.</span>
            </div>
            <Link to="/profile" className="text-sm font-medium text-primary hover:text-primary-hover transition-colors whitespace-nowrap ml-4">
              Create Profile →
            </Link>
          </div>
        )}

        {/* Recommendations Grid */}
        {recommendations.length > 0 && (
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">Your Recommendations ({recommendations.length})</h2>
              <div className="text-sm text-text-muted">
                {recommendationInfo?.recommendationMode === 'behavioral' ? 'Behavioral model ranking' : 'Crowd rating ranking'}
              </div>
            </div>

            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendations.map((meal) => (
                <MealCard
                  key={meal._id}
                  meal={meal}
                  onRate={handleRating}
                  onFeedback={handleFeedback}
                  showRating={true}
                  showFeedback={true}
                />
              ))}
            </div>

            {/* Recommendations Info */}
            <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 mt-8">
              <h3 className="text-lg font-semibold text-text-primary mb-5">Recommendation Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Total Evaluated</div>
                  <div className="text-2xl font-bold font-mono text-text-primary">{recommendationInfo?.totalMealsEvaluated ?? recommendations.length}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Eligible Meals</div>
                  <div className="text-2xl font-bold font-mono text-primary">
                    {recommendationInfo?.totalEligible ?? recommendations.length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Ranking</div>
                  <div className="text-base font-semibold text-text-primary">
                    {recommendationInfo?.recommendationMode === 'behavioral' ? 'Behavioral model' : 'Crowd ratings'}
                  </div>
                </div>
              </div>

              <div className="bg-primary-muted rounded-lg p-4 text-sm text-text-secondary">
                <p className="mb-1"><span className="font-medium text-primary">How it works:</span></p>
                <p>Profile filters select eligible meals. The current ranking uses a five-rating prior and verified crowd feedback; its score is not a personal match probability.</p>
              </div>
            </div>
          </section>
        )}

        {/* Empty State */}
        {!loading && recommendations.length === 0 && !error && email && (
          <section className="text-center py-16 bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="text-5xl mb-6">🔍</div>
            <h3 className="text-xl font-semibold mb-3 text-text-primary">No Recommendations Yet</h3>
            <p className="text-text-secondary mb-8 max-w-md mx-auto text-sm">
              Enter your email and click "Get My Recommendations" to discover amazing meals!
            </p>
            {!student && (
              <Link to={`/profile?email=${email}`} className="border border-border text-text-primary rounded-full px-6 py-2.5 text-sm font-medium hover:bg-surface-alt transition-colors">
                Create Your Profile First
              </Link>
            )}
          </section>
        )}
      </div>
    </main>
  );
};

export default Recommendations;
