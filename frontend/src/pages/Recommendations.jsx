import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { mealAPI, studentAPI, apiUtils } from "../services/api";
import MealCard from "../components/meals/MealCard";
import Skeleton from "../components/common/Skeleton";
import ErrorMessage from "../components/common/ErrorMessage";
import { useStaggeredEntry } from "../hooks/useStaggeredEntry";

const Recommendations = () => {
  const [email, setEmail] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [student, setStudent] = useState(null);
  const [filters, setFilters] = useState({
    limit: 10,
    mealType: "",
  });

  const gridRef = useStaggeredEntry([recommendations]);

  // Load email from URL params or localStorage
  useEffect(() => {
    const urlEmail = new URLSearchParams(window.location.search).get("email");
    const savedEmail = localStorage.getItem("userEmail");
    if (urlEmail) {
      setEmail(urlEmail);
      localStorage.setItem("userEmail", urlEmail);
    } else if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  // Load student profile when email changes
  useEffect(() => {
    if (email && apiUtils.validateEmail(email)) {
      loadStudentProfile();
    }
  }, [email]);

  const loadStudentProfile = async () => {
    try {
      const response = await studentAPI.getProfile(email);
      if (response.success) {
        setStudent(response.student);
      }
    } catch {
      console.log("Student profile not found");
      setStudent(null);
    }
  };

  const fetchRecommendations = async () => {
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    if (!apiUtils.validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      localStorage.setItem("userEmail", email);

      const response = await mealAPI.getRecommendations(email, filters);

      if (response.success) {
        setRecommendations(response.recommendations || []);

        if (response.recommendations.length === 0) {
          setError(
            "No recommendations found. Try updating your profile preferences."
          );
        }
      } else {
        setError("Failed to get recommendations");
      }
    } catch (error) {
      setError(apiUtils.handleError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleRating = async (mealId, rating) => {
    try {
      await mealAPI.rateMeal(mealId, rating, email);
      setRecommendations((prev) =>
        prev.map((meal) =>
          meal._id === mealId ? { ...meal, userRating: rating } : meal
        )
      );
      setSuccess(`✅ Rating submitted! You gave ${rating} star${rating !== 1 ? "s" : ""}.`);
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("Failed to submit rating:", error);
      setError(`Failed to submit rating: ${apiUtils.handleError(error)}`);
      setSuccess("");
    }
  };

  const handleFeedback = async (mealId, liked) => {
    try {
      await studentAPI.recordFeedback(email, mealId, liked);
      setRecommendations((prev) =>
        prev.map((meal) =>
          meal._id === mealId ? { ...meal, userFeedback: liked } : meal
        )
      );
      setSuccess(`✅ Feedback recorded! You ${liked ? "liked" : "disliked"} this meal.`);
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("Failed to record feedback:", error);
      setError(`Failed to record feedback: ${apiUtils.handleError(error)}`);
      setSuccess("");
    }
  };

  const handleFilterChange = (field, value) => {
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
            Get AI-powered meal suggestions based on your preferences and nutrition goals.
          </p>
        </div>

        {/* Email Input and Filters */}
        <section className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 md:p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Your Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors placeholder:text-text-muted"
                placeholder="Enter your email to get recommendations"
              />
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
              disabled={loading || !email}
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
                to={`/profile?email=${email}`}
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
              <span className="text-sm text-text-secondary">No profile found for this email. Create your profile first for better recommendations!</span>
            </div>
            <Link to={`/profile?email=${email}`} className="text-sm font-medium text-primary hover:text-primary-hover transition-colors whitespace-nowrap ml-4">
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
                {recommendations.filter((m) => m.mlRecommended).length} AI-powered
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
                  userEmail={email}
                />
              ))}
            </div>

            {/* Recommendations Info */}
            <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 mt-8">
              <h3 className="text-lg font-semibold text-text-primary mb-5">Recommendation Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Total Evaluated</div>
                  <div className="text-2xl font-bold font-mono text-text-primary">99</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">AI Picks</div>
                  <div className="text-2xl font-bold font-mono text-primary">
                    {recommendations.filter((m) => m.mlRecommended).length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Avg Confidence</div>
                  <div className="text-2xl font-bold font-mono text-text-primary">
                    {recommendations.length > 0
                      ? Math.round((recommendations.reduce((acc, m) => acc + (m.confidence || 0), 0) / recommendations.length) * 100)
                      : 0}%
                  </div>
                </div>
              </div>

              <div className="bg-primary-muted rounded-lg p-4 text-sm text-text-secondary">
                <p className="mb-1"><span className="font-medium text-primary">How it works:</span></p>
                <p>Our AI analyzes your preferences, nutrition goals, and dietary restrictions to find meals you'll love. Rate meals to improve future recommendations!</p>
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
