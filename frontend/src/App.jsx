import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import StudentForm from "./pages/StudentForm.jsx";
import Recommendations from "./pages/Recommendations.jsx";
import BrowseMeals from "./pages/BrowseMeals.jsx";
import AdminMealForm from "./pages/AdminMealForm.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import Navigation from "./components/common/Navigation.jsx";
import { systemAPI } from './services/api';
import { readSession } from './services/session';

const ProtectedAdminRoute = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    let request = 0;
    const checkSession = async () => {
      const current = ++request;
      const session = readSession();
      if (session?.role !== 'admin') {
        setIsAdmin(false);
        return;
      }
      setIsAdmin(null);
      try {
        const user = await systemAPI.me();
        if (current === request) setIsAdmin(user.role === 'admin' && user.username === session.username);
      } catch {
        if (current === request) setIsAdmin(false);
      }
    };

    checkSession();
    window.addEventListener('storage', checkSession);
    window.addEventListener('adminLoginChange', checkSession);
    return () => {
      request++;
      window.removeEventListener('storage', checkSession);
      window.removeEventListener('adminLoginChange', checkSession);
    };
  }, []);

  if (isAdmin === null) return <div role="status">Checking admin access…</div>;
  return isAdmin ? children : <Navigate to="/admin/login" replace />;
};

const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-background flex flex-col text-text-primary pt-20">
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<StudentForm />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/browse" element={<BrowseMeals />} />
          <Route
            path="/admin/meals"
            element={
              <ProtectedAdminRoute>
                <AdminMealForm />
              </ProtectedAdminRoute>
            }
          />
          <Route path="/admin/login" element={<AdminLogin />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;

