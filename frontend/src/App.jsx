import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import StudentForm from "./pages/StudentForm.jsx";
import Recommendations from "./pages/Recommendations.jsx";
import BrowseMeals from "./pages/BrowseMeals.jsx";
import AdminMealForm from "./pages/AdminMealForm.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import StudentAuth from './pages/StudentAuth.jsx';
import Navigation from "./components/common/Navigation.jsx";
import { systemAPI } from './services/api';
import { readSession } from './services/session';

const ProtectedRoute = ({ children, role, loginPath }) => {
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    let request = 0;
    const checkSession = async () => {
      const current = ++request;
      const session = readSession();
      if (session?.role !== role) {
        setAllowed(false);
        return;
      }
      setAllowed(null);
      try {
        const user = await systemAPI.me();
        if (current === request) setAllowed(user.role === role && user.username === session.username &&
          (role !== 'student' || user.email === session.email));
      } catch {
        if (current === request) setAllowed(false);
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
  }, [role]);

  if (allowed === null) return <div role="status">Checking account access…</div>;
  return allowed ? children : <Navigate to={loginPath} replace />;
};

const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-background flex flex-col text-text-primary pt-20">
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/student/login" element={<StudentAuth />} />
          <Route path="/profile" element={<ProtectedRoute role="student" loginPath="/student/login"><StudentForm /></ProtectedRoute>} />
          <Route path="/recommendations" element={<ProtectedRoute role="student" loginPath="/student/login"><Recommendations /></ProtectedRoute>} />
          <Route path="/browse" element={<BrowseMeals />} />
          <Route
            path="/admin/meals"
            element={
              <ProtectedRoute role="admin" loginPath="/admin/login">
                <AdminMealForm />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/login" element={<AdminLogin />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;

