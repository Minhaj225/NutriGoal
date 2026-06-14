import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { systemAPI } from "../services/api";

const AdminLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Check if already logged in
  useEffect(() => {
    if (localStorage.getItem("isAdmin") === "true") {
      navigate("/admin/meals");
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await systemAPI.login(username, password);

      if (response.success) {
        // Store admin status in localStorage
        localStorage.setItem("isAdmin", "true");
        localStorage.setItem("adminUser", username);

        // Dispatch custom event to notify Navigation component
        window.dispatchEvent(new Event("adminLoginChange"));

        // Redirect to admin dashboard
        navigate("/admin/meals");
      } else {
        setError(response.message || "Invalid credentials");
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Login failed. Please check your connection."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("adminUser");
    window.dispatchEvent(new Event("adminLoginChange"));
    navigate("/");
  };

  // If already logged in, show logout screen (fallback)
  if (localStorage.getItem("isAdmin") === "true") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text-primary px-4">
        <div className="max-w-md w-full bg-surface rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-border p-8 text-center">
          {/* Leaf Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-full bg-primary-muted flex items-center justify-center">
              <svg className="w-7 h-7" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2C16 2 28 6 28 16C28 22.627 22.627 28 16 28C9.373 28 4 22.627 4 16C4 10 8 6 12 4" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M16 2C16 2 16 10 16 16" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M16 10C19 7 24 6 24 6" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Admin Dashboard</h2>
          <p className="mb-8 text-text-secondary text-sm">You are already logged in as admin.</p>
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => navigate("/admin/meals")}
              className="w-full bg-primary text-white font-medium py-3 rounded-full hover:bg-primary-hover transition-colors"
            >
              Go to Dashboard
            </button>
            <button
              onClick={handleLogout}
              className="w-full bg-surface border border-border font-medium py-3 rounded-full text-text-secondary hover:border-error hover:text-error transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8 text-text-primary">
      <div className="max-w-md w-full bg-surface rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-border p-8">
        {/* Leaf Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary-muted flex items-center justify-center">
            <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2C16 2 28 6 28 16C28 22.627 22.627 28 16 28C9.373 28 4 22.627 4 16C4 10 8 6 12 4" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M16 2C16 2 16 10 16 16" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M16 10C19 7 24 6 24 6" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-text-primary">Admin Access</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to manage meals and view analytics
          </p>
        </div>

        {error && (
          <div className="bg-error-muted border border-error/30 text-error p-3 rounded-lg text-sm mb-6 flex items-start">
            <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-text-primary"
              placeholder="Enter admin username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-text-primary"
              placeholder="Enter password"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-primary text-white font-medium py-3 rounded-full hover:bg-primary-hover transition-colors flex justify-center items-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center">
          <Link to="/" className="text-primary text-sm font-medium hover:text-primary-hover transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
