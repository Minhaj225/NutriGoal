import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { mealAPI, systemAPI } from "../services/api";
import MealCard from "../components/meals/MealCard.jsx";
import Skeleton from "../components/common/Skeleton.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import TextType from "../components/extra/TextType.jsx";
import { useScrollReveal } from "../hooks/useScrollReveal.js";

const Home = () => {
  const [stats, setStats] = useState(null);
  const [featuredMeals, setFeaturedMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apiInfo, setApiInfo] = useState(null);

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        setLoading(true);

        const [infoRes, healthRes, statsRes, mealsRes] = await Promise.all([
          systemAPI.getApiInfo().catch(() => ({ data: { mlIntegration: { enabled: false } } })),
          systemAPI.healthCheck().catch(() => ({ data: { status: "error" } })),
          mealAPI.getStats().catch(() => ({ data: null })),
          mealAPI.getMeals({ limit: 6 }).catch(() => ({ data: { meals: [] } })),
        ]);

        if (statsRes.data) {
          setStats({
            ...statsRes.data,
            healthySystem: healthRes.data?.status === "ok",
          });
        }

        if (mealsRes.data?.meals) {
          const sorted = [...mealsRes.data.meals].sort((a, b) => {
            const scoreA = (a.averageRating || 0) + (a.popularity || 0) * 0.1;
            const scoreB = (b.averageRating || 0) + (b.popularity || 0) * 0.1;
            return scoreB - scoreA;
          });
          setFeaturedMeals(sorted.slice(0, 3));
        }

        setApiInfo(infoRes.data);
      } catch (err) {
        console.error("Error fetching home data:", err);
        setError("Failed to load dashboard data. Please check connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchHomeData();
  }, []);

  useScrollReveal('.reveal-up');

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 min-h-screen bg-background">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="card" />)}
        </div>
      </main>
    );
  }

  return (
    <main className="bg-background min-h-screen text-text-primary">

      {/* Hero Section */}
      <section className="py-24 md:py-32 reveal-up">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

            {/* Left — 60% Text */}
            <div className="lg:w-[60%] w-full">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-text-primary leading-[1.08] mb-6">
                <TextType
                  text={["Eat smarter.", "Live better.", "NutriGoal."]}
                  typingSpeed={75}
                  pauseDuration={1500}
                  showCursor={true}
                  cursorCharacter="|"
                />
              </h1>
              <p className="text-lg text-text-secondary max-w-md mb-8 leading-relaxed">
                AI-powered meal recommendations tailored to your nutrition goals, preferences, and lifestyle.
              </p>

              {error && <ErrorMessage message={error} />}

              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <Link
                  to="/profile"
                  className="bg-primary text-white rounded-full px-8 py-3 font-medium hover:bg-primary-hover transition-colors shadow-sm text-center"
                >
                  Create Profile →
                </Link>
                <Link
                  to="/browse"
                  className="border border-border text-text-primary rounded-full px-8 py-3 font-medium hover:bg-surface-alt transition-colors text-center"
                >
                  Browse Meals
                </Link>
              </div>
            </div>

            {/* Right — 40% Floating Visual */}
            <div className="lg:w-[40%] w-full flex justify-center lg:justify-end">
              <div className="relative">
                <div className="bg-surface rounded-2xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.08)] p-6 rotate-2 hover:rotate-0 transition-transform duration-500 max-w-xs">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-text-primary">Your Top Match</div>
                      <div className="text-xs text-text-muted">98% confidence</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-surface-alt rounded-xl p-3">
                      <div className="text-sm font-medium text-text-primary">Paneer Tikka Bowl</div>
                      <div className="text-xs text-text-muted mt-1">420 cal · 28g protein</div>
                    </div>
                    <div className="bg-surface-alt rounded-xl p-3">
                      <div className="text-sm font-medium text-text-primary">Dal Makhani</div>
                      <div className="text-xs text-text-muted mt-1">380 cal · 18g protein</div>
                    </div>
                    <div className="bg-surface-alt rounded-xl p-3">
                      <div className="text-sm font-medium text-text-primary">Veggie Biryani</div>
                      <div className="text-xs text-text-muted mt-1">510 cal · 15g protein</div>
                    </div>
                  </div>
                </div>
                {/* Decorative floating badge */}
                <div className="absolute -top-3 -left-3 bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-md">
                  AI Powered ✨
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Stats Section */}
        {stats && (
          <section className="mb-24 reveal-up">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-surface rounded-2xl p-6 border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-3xl font-bold text-primary font-mono mb-1">{stats.totalMeals}</div>
                <div className="text-text-muted text-sm">Total Meals</div>
              </div>

              <div className="bg-surface rounded-2xl p-6 border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-3xl font-bold text-primary font-mono mb-1">{stats.cuisineCount}</div>
                <div className="text-text-muted text-sm">Cuisines</div>
              </div>

              <div className="bg-surface rounded-2xl p-6 border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-3xl font-bold text-primary font-mono mb-1">{stats.averageRating.toFixed(1)}</div>
                <div className="text-text-muted text-sm">Avg Rating</div>
              </div>

              <div className="bg-surface rounded-2xl p-6 border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className={`text-xl font-bold mb-1 ${stats.healthySystem ? 'text-success' : 'text-error'}`}>
                  {stats.healthySystem ? "Online ✓" : "Issues ✕"}
                </div>
                <div className="text-text-muted text-sm">
                  {apiInfo?.mlIntegration?.enabled ? "ML Connected" : "ML Offline"}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Features Section — Asymmetric Bento */}
        <section className="mb-24 reveal-up">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary mb-10">
            Why NutriGoal?
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Large card — spans 3 cols */}
            <div className="lg:col-span-3 bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden min-h-[280px] relative group">
              <div className="p-8 pb-0 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-primary-muted flex items-center justify-center mb-5">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg md:text-xl font-semibold text-text-primary mb-3">AI-Powered Recommendations</h3>
                <p className="text-text-secondary text-sm leading-relaxed max-w-md">
                  Our machine learning model analyzes your preferences, nutrition goals, and eating history to provide deeply personalized meal suggestions that improve over time.
                </p>
              </div>

              {/* Mock UI graphic pushing to the bottom right */}
              <div className="mt-8 flex-1 relative min-h-[140px] pointer-events-none">
                {/* Background ambient glow */}
                <div className="absolute right-0 bottom-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl translate-x-1/4 translate-y-1/4 group-hover:bg-primary/15 transition-colors duration-500"></div>
                
                {/* Floating Mock Data Card */}
                <div className="absolute right-8 lg:right-12 -bottom-2 bg-white rounded-t-xl border border-border border-b-0 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] p-5 w-64 lg:w-72 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                  <div className="flex items-center justify-between mb-4">
                     <div className="text-xs font-semibold text-text-primary">Macro Analysis</div>
                     <div className="text-[10px] text-primary font-semibold bg-primary-muted px-2 py-0.5 rounded-full border border-primary/20">98% Fit</div>
                  </div>
                  <div className="space-y-3">
                     <div>
                       <div className="flex justify-between text-[10px] text-text-muted mb-1"><span>Protein</span><span>100%</span></div>
                       <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden">
                         <div className="h-full bg-primary w-full"></div>
                       </div>
                     </div>
                     <div>
                       <div className="flex justify-between text-[10px] text-text-muted mb-1"><span>Calories</span><span>85%</span></div>
                       <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden">
                         <div className="h-full bg-primary/60 w-[85%]"></div>
                       </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Two stacked cards — span 2 cols */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-surface rounded-2xl p-8 border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex-1">
                <div className="w-10 h-10 rounded-xl bg-primary-muted flex items-center justify-center mb-5">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Nutrition-Focused</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Set calorie and protein goals. Recommendations align with your nutritional objectives.
                </p>
              </div>

              <div className="bg-surface rounded-2xl p-8 border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex-1">
                <div className="w-10 h-10 rounded-xl bg-primary-muted flex items-center justify-center mb-5">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Diverse Cuisines</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  North Indian, South Indian, Street Food, and more — perfect for diverse student communities.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Meals Section */}
        {featuredMeals.length > 0 && (
          <section className="mb-24 reveal-up">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Featured Meals</h2>
              <Link to="/browse" className="text-sm font-medium text-primary hover:text-primary-hover transition-colors">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredMeals.map((meal) => (
                <MealCard key={meal._id} meal={meal} showRating={true} />
              ))}
            </div>
          </section>
        )}

        {/* CTA Footer Section */}
        <section className="mb-24 reveal-up">
          <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] py-16 px-8">
            <div className="text-center max-w-xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary mb-4">
                Ready to eat smarter?
              </h2>
              <p className="text-text-secondary mb-8 leading-relaxed">
                Create your profile in under 2 minutes and get AI-powered meal recommendations tailored just for you.
              </p>
              <Link
                to="/profile"
                className="bg-primary text-white rounded-full px-8 py-3 font-medium hover:bg-primary-hover transition-colors shadow-sm inline-block"
              >
                Get Started Now →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Home;
