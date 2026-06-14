import React, { useState, useEffect } from "react";
import { mealAPI, mlAPI } from "../services/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ErrorMessage from "../components/common/ErrorMessage";
import ConfirmModal from "../components/common/ConfirmModal";

const AdminMealForm = () => {
  const [form, setForm] = useState({
    mealName: "",
    cuisine: "North Indian",
    category: "Main Dish",
    calories: "",
    protein: "",
    carbohydrates: "",
    fats: "",
    dietaryPreference: "Vegetarian",
    servingSize: "",
    allergens: "",
    ingredients: "",
    description: "",
    imageUrl: "",
    nutritionScore: "",
  });

  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mlFeatures, setMlFeatures] = useState([]);
  const [bulkImportFile, setBulkImportFile] = useState(null);
  const [mealToDelete, setMealToDelete] = useState(null);

  const cuisineOptions = [
    "North Indian",
    "South Indian",
    "Street Food",
    "General",
  ];
  const categoryOptions = [
    "Main Dish",
    "Breakfast",
    "Snack",
    "Side Dish",
    "Staple",
  ];
  const dietOptions = ["Vegetarian", "Non-Vegetarian"];

  useEffect(() => {
    if (localStorage.getItem("token") !== "true" && !localStorage.getItem("token")) {
       // Optional: check token validity or just redirect if missing
    }
    loadMeals();
    loadMLFeatures();
  }, [page]);

  const loadMeals = async () => {
    try {
      const response = await mealAPI.getMeals({}, page);
      setMeals(response.meals || []);
      setTotalPages(response.totalPages || 1);
    } catch (err) {
      console.error("Error loading meals:", err);
    }
  };

  const loadMLFeatures = async () => {
    try {
      const response = await mlAPI.getFeatures();
      setMlFeatures(response.features || []);
    } catch (err) {
      console.error("Error loading ML features:", err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const mealData = {
        ...form,
        calories: Number(form.calories),
        protein: Number(form.protein),
        carbohydrates: form.carbohydrates
          ? Number(form.carbohydrates)
          : undefined,
        fats: form.fats ? Number(form.fats) : undefined,
        nutritionScore: form.nutritionScore
          ? Number(form.nutritionScore)
          : undefined,
        allergens: form.allergens
          ? form.allergens
              .split(",")
              .map((a) => a.trim())
              .filter((a) => a)
          : [],
        ingredients: form.ingredients
          ? form.ingredients
              .split(",")
              .map((i) => i.trim())
              .filter((i) => i)
          : [],
      };

      await mealAPI.createMeal(mealData);
      setSuccess("Meal added successfully!");

      setForm({
        mealName: "",
        cuisine: "North Indian",
        category: "Main Dish",
        calories: "",
        protein: "",
        carbohydrates: "",
        fats: "",
        dietaryPreference: "Vegetarian",
        servingSize: "",
        allergens: "",
        ingredients: "",
        description: "",
        imageUrl: "",
        nutritionScore: "",
      });

      setPage(1);
      loadMeals();
    } catch (err) {
      setError("Failed to add meal: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (mealId) => {
    setMealToDelete(mealId);
  };

  const confirmDelete = async () => {
    if (!mealToDelete) return;
    try {
      await mealAPI.deleteMeal(mealToDelete);
      setSuccess("Meal deleted successfully!");
      loadMeals();
    } catch (err) {
      setError("Failed to delete meal: " + err.message);
    }
    setMealToDelete(null);
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkImportFile) {
      setError("Please select a CSV file");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const text = await bulkImportFile.text();
      const lines = text.split("\n");
      const headers = lines[0].split(",").map((h) => h.trim());

      const meals = lines
        .slice(1)
        .filter((line) => line.trim())
        .map((line) => {
          const values = line.split(",").map((v) => v.trim());
          const meal = {};
          headers.forEach((header, index) => {
            meal[header] = values[index];
          });
          return meal;
        });

      await mealAPI.bulkImportMeals(meals);
      setSuccess(`Successfully imported ${meals.length} meals!`);
      setPage(1);
      loadMeals();
      setBulkImportFile(null);
    } catch (err) {
      setError("Failed to import meals: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClassName = "w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors";
  const selectClassName = "w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none transition-colors";
  const labelClassName = "block text-sm font-medium text-text-secondary mb-2";

  return (
    <main className="min-h-screen bg-background py-12 text-text-primary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Meal Management</h1>
          <div className="flex items-center gap-3 bg-surface px-4 py-2 rounded-full border border-border">
            <div className="px-3 py-1 bg-primary-muted text-primary rounded-full text-sm font-medium">
              {meals.length} Meals
            </div>
            <div className="text-sm font-medium text-text-secondary border-l border-border pl-3">
              Page {page} of {totalPages}
            </div>
          </div>
        </div>

        {error && <ErrorMessage message={error} />}
        {success && (
          <div className="bg-primary-muted border border-primary/20 text-primary p-4 rounded-xl mb-6 flex items-start">
            <svg className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-text-primary">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add New Meal Form — takes 2 columns */}
          <section className="lg:col-span-2 bg-surface rounded-2xl border border-border p-6 md:p-8">
            <h2 className="text-xl font-semibold mb-6">Add New Meal</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="mealName" className={labelClassName}>Meal Name *</label>
                  <input
                    id="mealName"
                    name="mealName"
                    value={form.mealName}
                    onChange={handleChange}
                    placeholder="e.g., Dal Tadka"
                    className={inputClassName}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="cuisine" className={labelClassName}>Cuisine *</label>
                  <select
                    id="cuisine"
                    name="cuisine"
                    value={form.cuisine}
                    onChange={handleChange}
                    className={selectClassName}
                    required
                  >
                    {cuisineOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="category" className={labelClassName}>Category *</label>
                  <select
                    id="category"
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    className={selectClassName}
                    required
                  >
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="dietaryPreference" className={labelClassName}>Dietary Preference *</label>
                  <select
                    id="dietaryPreference"
                    name="dietaryPreference"
                    value={form.dietaryPreference}
                    onChange={handleChange}
                    className={selectClassName}
                    required
                  >
                    {dietOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="calories" className={labelClassName}>Calories *</label>
                  <input
                    id="calories"
                    name="calories"
                    type="number"
                    value={form.calories}
                    onChange={handleChange}
                    placeholder="180"
                    className={inputClassName}
                    required
                    min="0"
                  />
                </div>

                <div>
                  <label htmlFor="protein" className={labelClassName}>Protein (g) *</label>
                  <input
                    id="protein"
                    name="protein"
                    type="number"
                    step="0.1"
                    value={form.protein}
                    onChange={handleChange}
                    placeholder="9.5"
                    className={inputClassName}
                    required
                    min="0"
                  />
                </div>

                <div>
                  <label htmlFor="carbohydrates" className={labelClassName}>Carbohydrates (g)</label>
                  <input
                    id="carbohydrates"
                    name="carbohydrates"
                    type="number"
                    step="0.1"
                    value={form.carbohydrates}
                    onChange={handleChange}
                    placeholder="25.0"
                    className={inputClassName}
                    min="0"
                  />
                </div>

                <div>
                  <label htmlFor="fats" className={labelClassName}>Fats (g)</label>
                  <input
                    id="fats"
                    name="fats"
                    type="number"
                    step="0.1"
                    value={form.fats}
                    onChange={handleChange}
                    placeholder="5.2"
                    className={inputClassName}
                    min="0"
                  />
                </div>

                <div>
                  <label htmlFor="servingSize" className={labelClassName}>Serving Size</label>
                  <input
                    id="servingSize"
                    name="servingSize"
                    value={form.servingSize}
                    onChange={handleChange}
                    placeholder="1 bowl (200g)"
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label htmlFor="nutritionScore" className={labelClassName}>Nutrition Score (0-10)</label>
                  <input
                    id="nutritionScore"
                    name="nutritionScore"
                    type="number"
                    step="0.1"
                    value={form.nutritionScore}
                    onChange={handleChange}
                    placeholder="7.5"
                    className={inputClassName}
                    min="0"
                    max="10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="description" className={labelClassName}>Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Delicious and nutritious meal description..."
                  className={`${inputClassName} resize-y`}
                  rows="3"
                ></textarea>
              </div>

              <div>
                <label htmlFor="imageUrl" className={labelClassName}>Image URL</label>
                <input
                  id="imageUrl"
                  name="imageUrl"
                  value={form.imageUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/meal-image.jpg"
                  className={inputClassName}
                />
              </div>

              <div>
                <label htmlFor="allergens" className={labelClassName}>Allergens (comma-separated)</label>
                <input
                  id="allergens"
                  name="allergens"
                  value={form.allergens}
                  onChange={handleChange}
                  placeholder="nuts, dairy, gluten"
                  className={inputClassName}
                />
              </div>

              <div>
                <label htmlFor="ingredients" className={labelClassName}>Ingredients (comma-separated)</label>
                <input
                  id="ingredients"
                  name="ingredients"
                  value={form.ingredients}
                  onChange={handleChange}
                  placeholder="lentils, tomatoes, onions, spices"
                  className={inputClassName}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-primary text-white font-medium py-3 rounded-full hover:bg-primary-hover transition-colors flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? <LoadingSpinner size="sm" /> : "Add Meal"}
                </button>
              </div>
            </form>
          </section>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Bulk Import */}
            <section className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold mb-4">Bulk Import</h2>
              <form onSubmit={handleBulkImport} className="space-y-4">
                <div>
                  <label htmlFor="csvFile" className={labelClassName}>CSV File</label>
                  <input
                    id="csvFile"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBulkImportFile(e.target.files[0])}
                    className="block w-full text-sm text-text-secondary
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-medium
                      file:bg-primary-muted file:text-primary
                      hover:file:bg-primary/15 cursor-pointer"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-2.5 bg-surface border border-border rounded-full text-sm font-medium hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading || !bulkImportFile}
                >
                  {loading ? <LoadingSpinner size="sm" /> : "Import CSV"}
                </button>
              </form>
            </section>

            {/* ML Features Info */}
            {mlFeatures.length > 0 && (
              <section className="bg-surface rounded-2xl border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">ML Features</h2>
                  <div className="px-2.5 py-1 bg-primary-muted text-primary rounded-full text-xs font-medium">
                    Active
                  </div>
                </div>
                <p className="text-sm text-text-secondary mb-4">
                  Current ML model uses {mlFeatures.length} features:
                </p>
                <div className="flex flex-wrap gap-2">
                  {mlFeatures.map((feature) => (
                    <span key={feature} className="bg-primary-muted text-primary rounded-full px-3 py-1.5 text-xs font-medium">
                      {feature}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Existing Meals Table */}
        <section className="bg-surface rounded-2xl border border-border mt-8 overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold">Existing Meals</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-alt text-text-secondary text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">Cuisine</th>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium">Calories</th>
                  <th className="px-6 py-4 font-medium">Protein</th>
                  <th className="px-6 py-4 font-medium">Diet</th>
                  <th className="px-6 py-4 font-medium">Rating</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {meals.map((meal) => (
                  <tr key={meal._id} className="border-b border-border hover:bg-surface-alt/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-text-primary">{meal.mealName}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        meal.cuisine === "North Indian" ? "bg-error-muted text-error" :
                        meal.cuisine === "South Indian" ? "bg-primary-muted text-primary" :
                        "bg-warning-muted text-warning"
                      }`}>
                        {meal.cuisine}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-surface-alt border border-border rounded-full text-xs text-text-secondary">
                        {meal.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-text-secondary">{meal.calories} cal</td>
                    <td className="px-6 py-4 text-text-secondary">{meal.protein}g</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        meal.dietaryPreference === "Vegetarian" ? "bg-primary-muted text-primary" : "bg-error-muted text-error"
                      }`}>
                        {meal.dietaryPreference}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-text-secondary">
                      {meal.averageRating ? (
                        <div className="flex items-center">
                          <span className="text-warning mr-1">⭐</span>
                          <span>{meal.averageRating.toFixed(1)}</span>
                          <span className="text-text-muted ml-1">({meal.totalRatings})</span>
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs italic">No ratings</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(meal._id)}
                        className="text-error hover:bg-error-muted rounded-lg p-2 transition-colors"
                        title="Delete meal"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-6 border-t border-border flex justify-center items-center gap-4">
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
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={!!mealToDelete}
        onClose={() => setMealToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Meal"
        message="Are you sure you want to delete this meal?"
      />
    </main>
  );
};

export default AdminMealForm;
