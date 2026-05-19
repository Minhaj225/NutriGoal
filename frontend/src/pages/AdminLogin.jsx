import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { systemAPI } from "../services/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ErrorMessage from "../components/common/ErrorMessage";

const AdminLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already logged in as admin
    if (localStorage.getItem("isAdmin") === "true") {
      navigate("/admin/meals", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await systemAPI.login(username, password);

      if (response.success) {
        localStorage.setItem("token", response.token);
        localStorage.setItem("isAdmin", "true");
        localStorage.setItem("adminUser", response.username);

        // Dispatch custom event for other components to listen
        window.dispatchEvent(new Event("adminLoginChange"));

        // Navigate with replace to avoid going back to login
        navigate("/admin/meals", { replace: true });
      } else {
        setError("Invalid credentials.");
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Invalid username or password.");
      } else {
        setError(err.message || "Login failed. Please try again.");
      }
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("adminUser");
    setUsername("");
    setPassword("");
  };

  const isLoggedIn = localStorage.getItem("isAdmin") === "true";

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-secondary/20 rounded-full blur-3xl"></div>
      </div>

      {/* Login Form */}
      <div className="card bg-slate-800 shadow-2xl border border-slate-700 max-w-md w-full relative z-10">
        <div className="card-body p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="text-3xl">🔐</span>
            </div>
            <h1 className="text-3xl font-bold text-white">Admin Login</h1>
            <p className="text-slate-400 mt-2">
              Enter your credentials to access the dashboard
            </p>
          </div>

          {isLoggedIn ? (
            <div className="text-center space-y-4">
              <div className="alert alert-success bg-green-500/10 border-green-500/20 text-green-400">
                <span>✅ You are logged in as admin</span>
              </div>
              <div className="flex flex-col gap-3">
                <Link to="/admin/meals" className="btn btn-primary w-full">
                  Go to Admin Dashboard
                </Link>
                <button onClick={handleLogout} className="btn btn-outline btn-error w-full">
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="alert alert-error bg-error/10 border-error/20 text-error text-sm py-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>{error}</span>
                </div>
              )}
              
              <div className="form-control ml-7">
                <label className="label">
                  <span className="label-text text-slate-300 font-medium">Username</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input input-bordered bg-slate-900 border-slate-700 text-white focus:border-primary"
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-control ml-7">
                <label className="label">
                  <span className="label-text text-slate-300 font-medium">Password</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input input-bordered bg-slate-900 border-slate-700 text-white focus:border-primary"
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary ml-7 w-[85%] h-12 text-lg font-semibold transition-all hover:scale-[1.02]"
                disabled={loading}
              >
                {loading ? <LoadingSpinner size="sm" /> : "Sign In"}
              </button>
            </form>
          )}

          <div className="divider text-slate-200 text-xs uppercase tracking-widest">Quick Access</div>

          <div className="grid grid-cols-2 gap-3">
            <Link to="/" className="btn btn-outline btn-sm border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white">
              🏠 Home
            </Link>
            <Link to="/browse" className="btn btn-outline btn-sm border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white">
              🔍 Browse
            </Link>
          </div>

          {/* Admin Features Info */}
          <div className="mt-8 p-4 bg-slate-900/50 border border-slate-700 rounded-xl">
            <h4 className="text-slate-200 font-semibold text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1 h-1 bg-primary rounded-full"></span>
              Admin Capabilities
            </h4>
            <ul className="text-[11px] space-y-2 text-slate-400">
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span> Meal CRUD & Bulk Import
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span> Analytics & Ratings
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span> ML Integration Monitoring
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
