import React, { useState, useEffect } from "react";
import { studentAPI, apiUtils } from "../services/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ErrorMessage from "../components/common/ErrorMessage";
import Skeleton from "../components/common/Skeleton";

const StudentForm = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    preferences: {
      cuisines: [],
      dietaryPreference: "Vegetarian",
      categories: []
    },
    allergies: [],
    nutritionGoals: {
      caloriesPerDay: 2000,
      proteinGramsPerDay: 80,
      maxCaloriesPerMeal: 500,
      minProteinPerMeal: 15
    },
    activityLevel: "Moderate"
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [existingProfile, setExistingProfile] = useState(null);

  const cuisineOptions = ["North Indian", "South Indian", "Street Food", "General"];
  const categoryOptions = ["Main Dish", "Breakfast", "Snack", "Side Dish", "Staple"];
  const activityLevels = ["Low", "Moderate", "High"];

  useEffect(() => {
    const loadProfile = async () => {
      const email = new URLSearchParams(window.location.search).get('email');
      if (email) {
        try {
          const response = await studentAPI.getProfile(email);
          if (response.success && response.student) {
            setForm(response.student);
            setExistingProfile(response.student);
          }
        } catch {
          console.log("No existing profile found");
        }
      }
    };
    loadProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setForm(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleArrayChange = (field, value, isChecked) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setForm(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: isChecked 
            ? [...prev[parent][child], value]
            : prev[parent][child].filter(item => item !== value)
        }
      }));
    } else {
      setForm(prev => ({
        ...prev,
        [field]: isChecked 
          ? [...prev[field], value]
          : prev[field].filter(item => item !== value)
      }));
    }
  };

  const handleAllergiesChange = (e) => {
    const allergies = e.target.value.split(',').map(s => s.trim()).filter(s => s);
    setForm(prev => ({ ...prev, allergies }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!form.name || !form.email) {
      setError("Name and email are required");
      setLoading(false);
      return;
    }

    if (!apiUtils.validateEmail(form.email)) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    try {
      const response = await studentAPI.createOrUpdateProfile(form);
      setSuccess(response.message || "Profile saved successfully!");
      setExistingProfile(response.student);
      
      const url = new URL(window.location);
      url.searchParams.set('email', form.email);
      window.history.replaceState(null, '', url);
      
    } catch (error) {
      setError(apiUtils.handleError(error));
    } finally {
      setLoading(false);
    }
  };

  if (loading && !existingProfile) {
    return (
      <main className="min-h-screen bg-background py-12 flex justify-center max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        <Skeleton variant="form" className="mt-8" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background py-24 md:py-32 text-text-primary">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Page Heading */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-text-primary">
            {existingProfile ? "Update Your Profile" : "Your Profile"}
          </h1>
          <p className="text-text-secondary mt-2">
            {existingProfile ? "Keep your preferences up to date for better recommendations." : "Set up your profile to get personalized meal recommendations."}
          </p>
        </div>

        {/* Form Card */}
        <section className="bg-surface rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border p-6 md:p-8">

          {error && <ErrorMessage message={error} />}
          {success && (
            <div className="bg-success/10 text-success rounded-lg p-3 mb-6 flex items-center gap-2 text-sm font-medium">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-text-primary mb-1.5">Name *</label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors placeholder:text-text-muted"
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1.5">Email *</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors placeholder:text-text-muted"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            {/* Cuisine Preferences — Pill Toggle Chips */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">Cuisine Preferences</label>
              <div className="flex flex-wrap gap-2">
                {cuisineOptions.map(cuisine => {
                  const isActive = form.preferences.cuisines.includes(cuisine);
                  return (
                    <button
                      key={cuisine}
                      type="button"
                      onClick={() => handleArrayChange('preferences.cuisines', cuisine, !isActive)}
                      className={`rounded-full px-4 py-2 border text-sm font-medium cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-primary-muted border-primary text-primary'
                          : 'bg-surface border-border text-text-secondary hover:border-text-muted'
                      }`}
                    >
                      {cuisine}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dietary Preference — Styled Radios */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">Dietary Preference</label>
              <div className="flex gap-3">
                {["Vegetarian", "Non-Vegetarian"].map(diet => (
                  <label
                    key={diet}
                    htmlFor={`diet-${diet}`}
                    className={`flex items-center gap-2.5 rounded-full px-5 py-2.5 border text-sm font-medium cursor-pointer transition-colors ${
                      form.preferences.dietaryPreference === diet
                        ? 'bg-primary-muted border-primary text-primary'
                        : 'bg-surface border-border text-text-secondary hover:border-text-muted'
                    }`}
                  >
                    <input
                      id={`diet-${diet}`}
                      type="radio"
                      name="preferences.dietaryPreference"
                      value={diet}
                      checked={form.preferences.dietaryPreference === diet}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      form.preferences.dietaryPreference === diet ? 'border-primary' : 'border-border'
                    }`}>
                      {form.preferences.dietaryPreference === diet && (
                        <span className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </span>
                    {diet}
                  </label>
                ))}
              </div>
            </div>

            {/* Meal Categories — Pill Toggle Chips */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">Preferred Meal Types</label>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map(category => {
                  const isActive = form.preferences.categories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleArrayChange('preferences.categories', category, !isActive)}
                      className={`rounded-full px-4 py-2 border text-sm font-medium cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-primary-muted border-primary text-primary'
                          : 'bg-surface border-border text-text-secondary hover:border-text-muted'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Activity Level */}
            <div>
              <label htmlFor="activityLevel" className="block text-sm font-medium text-text-primary mb-1.5">Activity Level</label>
              <select
                id="activityLevel"
                name="activityLevel"
                value={form.activityLevel}
                onChange={handleChange}
                className="w-full md:w-1/2 bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors appearance-none"
              >
                {activityLevels.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>

            {/* Nutrition Goals — Nested Card */}
            <div className="bg-surface-alt rounded-xl p-4">
              <h3 className="text-base font-semibold text-text-primary mb-5">Nutrition Goals</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="caloriesPerDay" className="block text-sm font-medium text-text-primary mb-1.5">Daily Calories</label>
                  <input
                    id="caloriesPerDay"
                    type="number"
                    name="nutritionGoals.caloriesPerDay"
                    value={form.nutritionGoals.caloriesPerDay}
                    onChange={handleChange}
                    className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                    min="1000"
                    max="5000"
                  />
                </div>

                <div>
                  <label htmlFor="proteinGramsPerDay" className="block text-sm font-medium text-text-primary mb-1.5">Daily Protein (g)</label>
                  <input
                    id="proteinGramsPerDay"
                    type="number"
                    name="nutritionGoals.proteinGramsPerDay"
                    value={form.nutritionGoals.proteinGramsPerDay}
                    onChange={handleChange}
                    className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                    min="20"
                    max="200"
                  />
                </div>

                <div>
                  <label htmlFor="maxCaloriesPerMeal" className="block text-sm font-medium text-text-primary mb-1.5">Max Calories per Meal</label>
                  <input
                    id="maxCaloriesPerMeal"
                    type="number"
                    name="nutritionGoals.maxCaloriesPerMeal"
                    value={form.nutritionGoals.maxCaloriesPerMeal}
                    onChange={handleChange}
                    className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                    min="100"
                    max="1000"
                  />
                </div>

                <div>
                  <label htmlFor="minProteinPerMeal" className="block text-sm font-medium text-text-primary mb-1.5">Min Protein per Meal (g)</label>
                  <input
                    id="minProteinPerMeal"
                    type="number"
                    name="nutritionGoals.minProteinPerMeal"
                    value={form.nutritionGoals.minProteinPerMeal}
                    onChange={handleChange}
                    className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                    min="5"
                    max="50"
                  />
                </div>
              </div>
            </div>

            {/* Allergies */}
            <div>
              <label htmlFor="allergies" className="block text-sm font-medium text-text-primary mb-1.5">Allergies</label>
              <input
                id="allergies"
                type="text"
                value={form.allergies.join(', ')}
                onChange={handleAllergiesChange}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors placeholder:text-text-muted"
                placeholder="Enter allergies separated by commas (e.g., nuts, dairy, soy)"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4 flex justify-center md:justify-start">
              <button
                type="submit"
                className="bg-primary text-white rounded-full px-8 py-3 font-medium hover:bg-primary-hover transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
                disabled={loading}
              >
                {loading ? 'Saving...' : existingProfile ? 'Update Profile' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
};

export default StudentForm;
