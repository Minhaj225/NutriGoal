import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import { mealAPI, apiUtils } from "../services/api";
import MealCard from "../components/meals/MealCard";
import Skeleton from "../components/common/Skeleton";
import ErrorMessage from "../components/common/ErrorMessage";
import { useStaggeredEntry } from "../hooks/useStaggeredEntry";
import { readSession } from '../services/session';

const BrowseMeals = () => {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    cuisine: "",
    category: "",
    dietaryPreference: "",
    minCalories: "",
    maxCalories: "",
    minProtein: "",
  });
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const signedInStudent = readSession()?.role === 'student';
  const [sortBy, setSortBy] = useState("popularity");

  // Debounce filters
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters]);

  const gridRef = useStaggeredEntry([meals]);

  const cuisineOptions = ["", "North Indian", "South Indian", "Street Food", "General"];
  const categoryOptions = ["", "Main Dish", "Breakfast", "Snack", "Side Dish", "Staple"];
  const dietOptions = ["", "Vegetarian", "Non-Vegetarian"];
  const sortOptions = [
    { value: "popularity", label: "Popularity" },
    { value: "rating", label: "Rating" },
    { value: "calories", label: "Calories (Low to High)" },
    { value: "protein", label: "Protein (High to Low)" },
  ];

  useEffect(() => {
    fetchMeals();
  }, []);

  useEffect(() => {
    fetchMeals();
  }, [debouncedFilters, sortBy, page]);

  const fetchMeals = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await mealAPI.getMeals(debouncedFilters, page, 20, sortBy);

      if (response.success) {
        setTotalPages(response.totalPages || 1);
        setMeals(response.meals);
      } else {
        setError("Failed to fetch meals");
      }
    } catch (error) {
      setError(apiUtils.handleError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      cuisine: "",
      category: "",
      dietaryPreference: "",
      minCalories: "",
      maxCalories: "",
      minProtein: "",
    });
    setPage(1);
  };

  const handleRating = async (mealId, rating) => {
    const saved = await mealAPI.rateMeal(mealId, rating);
    setMeals((prev) =>
      prev.map((meal) =>
        meal._id === mealId ? { ...meal, userRating: rating, averageRating: saved.newAverageRating,
          totalRatings: saved.totalRatings, ratingSum: saved.ratingSum } : meal
      )
    );
    return saved;
  };

  return (
    <main className="min-h-screen bg-background py-12 text-text-primary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Browse All Meals</h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
            Explore our comprehensive collection of delicious and nutritious meals
          </p>
        </div>

        {/* Filters */}
        <section className="bg-surface rounded-2xl border border-border p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-text-primary">Filter & Search</h3>
            <button
              onClick={clearFilters}
              className="text-primary hover:text-primary-hover text-sm font-medium"
            >
              Clear Filters
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Cuisine</label>
              <select
                value={filters.cuisine}
                onChange={(e) => handleFilterChange("cuisine", e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none transition-colors"
              >
                {cuisineOptions.map((option) => (
                  <option key={option} value={option}>{option || "All Cuisines"}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Category</label>
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange("category", e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none transition-colors"
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>{option || "All Categories"}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Diet</label>
              <select
                value={filters.dietaryPreference}
                onChange={(e) => handleFilterChange("dietaryPreference", e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none transition-colors"
              >
                {dietOptions.map((option) => (
                  <option key={option} value={option}>{option || "All Diets"}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Min Calories</label>
              <input
                type="number"
                value={filters.minCalories}
                onChange={(e) => handleFilterChange("minCalories", e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                placeholder="e.g., 100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Max Calories</label>
              <input
                type="number"
                value={filters.maxCalories}
                onChange={(e) => handleFilterChange("maxCalories", e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                placeholder="e.g., 500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Min Protein (g)</label>
              <input
                type="number"
                value={filters.minProtein}
                onChange={(e) => handleFilterChange("minProtein", e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                placeholder="e.g., 10"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center mt-6 pt-6 border-t border-border">
            <div className="mb-4 sm:mb-0">
              <label className="block text-sm font-medium text-text-secondary mb-2">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full sm:w-auto bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none transition-colors"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="text-text-muted text-sm">
              Found {meals.length} meals on page {page} of {totalPages}
            </div>
          </div>
        </section>

        {!signedInStudent && <p className="mb-8 text-sm text-text-secondary">
          <Link to="/student/login" className="text-primary font-medium">Sign in as a student</Link> to rate meals.
        </p>}

        {/* Error Display */}
        {error && <ErrorMessage message={error} onRetry={fetchMeals} />}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-12">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="card" />
            ))}
          </div>
        )}

        {/* Meals Grid */}
        {!loading && meals.length > 0 && (
          <>
            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {meals.map((meal) => (
                <MealCard
                  key={meal._id}
                  meal={meal}
                  onRate={handleRating}
                  showRating={signedInStudent}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-center items-center gap-4 mt-12 mb-8">
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1}
                className="border border-border rounded-lg px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    p === page
                      ? "bg-primary text-white"
                      : "border border-border text-text-primary hover:bg-surface-alt"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page === totalPages}
                className="border border-border rounded-lg px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && meals.length === 0 && !error && (
          <section className="text-center py-16 bg-surface rounded-2xl border border-border">
            <div className="text-5xl mb-6">🍽️</div>
            <h3 className="text-2xl font-semibold mb-3">No Meals Found</h3>
            <p className="text-text-secondary mb-8 max-w-md mx-auto">
              Try adjusting your filters to see more results
            </p>
            <button
              onClick={clearFilters}
              className="px-6 py-2.5 bg-primary text-white rounded-full font-medium hover:bg-primary-hover transition-colors"
            >
              Clear All Filters
            </button>
          </section>
        )}
      </div>
    </main>
  );
};

export default BrowseMeals;
