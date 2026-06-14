import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

const Navigation = () => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(
    localStorage.getItem("isAdmin") === "true"
  );

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleAdminChange = () => {
      setIsAdmin(localStorage.getItem("isAdmin") === "true");
    };

    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    window.addEventListener("adminLoginChange", handleAdminChange);
    window.addEventListener("storage", handleAdminChange);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("adminLoginChange", handleAdminChange);
      window.removeEventListener("storage", handleAdminChange);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/profile", label: "Profile" },
    { to: "/recommendations", label: "Recommendations" },
    { to: "/browse", label: "Browse" },
  ];

  return (
    <>
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl">
        <div className="bg-white/80 backdrop-blur-md rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-border px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left: Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
                <path d="M16 2C16 2 28 6 28 16C28 22.627 22.627 28 16 28C9.373 28 4 22.627 4 16C4 10 8 6 12 4" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M16 2C16 2 16 10 16 16" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M16 10C19 7 24 6 24 6" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="text-primary font-semibold text-lg">NutriGoal</span>
            </Link>

            {/* Center: Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActive(link.to)
                      ? "text-primary bg-primary-muted"
                      : "text-text-secondary hover:text-primary"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  to="/admin/meals"
                  className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActive("/admin/meals")
                      ? "text-primary bg-primary-muted"
                      : "text-text-secondary hover:text-primary"
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>

            {/* Right: User menu + Mobile hamburger */}
            <div className="flex items-center gap-2">
              {/* Admin icon (desktop) */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-alt hover:bg-border transition-colors"
                  id="user-menu-button"
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="true"
                >
                  <span className="sr-only">Open user menu</span>
                  {isAdmin ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 15l-2-2h-4l-2 2v2h16v-2l-2-2h-4l-2 2z"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  )}
                </button>

                {isUserMenuOpen && (
                  <div
                    className="origin-top-right absolute right-0 mt-2 w-48 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1 bg-surface border border-border focus:outline-none z-50"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu-button"
                    tabIndex="-1"
                  >
                    <Link
                      to="/profile"
                      className="block px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt hover:text-text-primary rounded-lg mx-1"
                      role="menuitem"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      Edit Profile
                    </Link>
                    <Link
                      to="/recommendations"
                      className="block px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt hover:text-text-primary rounded-lg mx-1"
                      role="menuitem"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      Get Recommendations
                    </Link>
                    <Link
                      to="/browse"
                      className="block px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt hover:text-text-primary rounded-lg mx-1"
                      role="menuitem"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      Browse All Meals
                    </Link>
                    <div className="border-t border-border my-1"></div>
                    <Link
                      to="/admin/login"
                      className="block px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt hover:text-text-primary rounded-lg mx-1"
                      role="menuitem"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      {isAdmin ? "Admin Dashboard" : "Admin Login"}
                    </Link>
                    {isAdmin && (
                      <button type="button"
                        className="block w-[calc(100%-0.5rem)] text-left px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt hover:text-text-primary rounded-lg mx-1"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsUserMenuOpen(false);
                          localStorage.removeItem("isAdmin");
                          localStorage.removeItem("adminUser");
                          window.dispatchEvent(new Event("adminLoginChange"));
                          window.location.href = "/";
                        }}
                      >
                        Admin Logout
                      </button>
                    )}
                    <button type="button"
                      className="block w-[calc(100%-0.5rem)] text-left px-4 py-2 text-sm text-error hover:bg-error-muted rounded-lg mx-1"
                      role="menuitem"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsUserMenuOpen(false);
                        localStorage.clear();
                        window.location.href = "/";
                      }}
                    >
                      Clear All Data
                    </button>
                  </div>
                )}
              </div>

              {/* Mobile hamburger */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-alt transition-colors"
                aria-label="Toggle menu"
              >
                <svg
                  className="w-5 h-5 text-text-secondary"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile full-screen overlay */}
      <div
        className={`fixed inset-0 z-40 bg-white/95 backdrop-blur-lg transition-all duration-300 md:hidden ${
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-center justify-center h-full gap-2">
          {navLinks.map((link, index) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-2xl font-semibold px-6 py-3 rounded-full transition-all duration-300 ${
                isMobileMenuOpen
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              } ${
                isActive(link.to)
                  ? "text-primary bg-primary-muted"
                  : "text-text-primary hover:text-primary"
              }`}
              style={{
                transitionDelay: isMobileMenuOpen ? `${index * 75}ms` : "0ms",
              }}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin/meals"
              className={`text-2xl font-semibold px-6 py-3 rounded-full transition-all duration-300 ${
                isMobileMenuOpen
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              } ${
                isActive("/admin/meals")
                  ? "text-primary bg-primary-muted"
                  : "text-text-primary hover:text-primary"
              }`}
              style={{
                transitionDelay: isMobileMenuOpen
                  ? `${navLinks.length * 75}ms`
                  : "0ms",
              }}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Admin
            </Link>
          )}
        </div>
      </div>
    </>
  );
};

export default Navigation;
