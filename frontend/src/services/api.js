import axios from 'axios';
import { readSession, clearSession } from './session';

// Base API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:5000';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = readSession()?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (!isLoginRequest && error.response?.status === 401 && readSession() &&
        (window.location.pathname.startsWith('/admin') || ['/profile', '/recommendations'].includes(window.location.pathname) || error.config?.url === '/auth/me')) {
      clearSession();
      if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
        window.location.assign('/admin/login');
      } else if (['/profile', '/recommendations'].includes(window.location.pathname)) {
        window.location.assign('/student/login');
      }
    }
    return Promise.reject(error);
  }
);

// ML API functions (direct calls to ML service)
export const mlAPI = {
  // Get ML model features
  getFeatures: async () => {
    const response = await axios.get(`${ML_API_URL}/features`);
    return response.data;
  },

  // Single meal prediction
  predictMeal: async (mealData) => {
    const response = await axios.post(`${ML_API_URL}/predict`, mealData);
    return response.data;
  },

  // Batch meal predictions
  predictMealsBatch: async (meals) => {
    const response = await axios.post(`${ML_API_URL}/predict_batch`, { meals });
    return response.data;
  },

  // ML API health check
  healthCheck: async () => {
    const response = await axios.get(`${ML_API_URL}/health`);
    return response.data;
  },

  // Get ML API info
  getInfo: async () => {
    const response = await axios.get(`${ML_API_URL}/`);
    return response.data;
  }
};

// Enhanced meal API functions
export const mealAPI = {
  // Get meal stats for home page
  getStats: async () => {
    const response = await api.get('/meals/stats');
    return response.data;
  },

  // Get all meals with filtering
  getMeals: async (filters = {}, page = 1, limit = 20, sortBy = "popularity") => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    params.append('page', page);
    params.append('limit', limit);
    params.append('sortBy', sortBy);
    
    const response = await api.get(`/meals?${params}`);
    return response.data;
  },

  // Get meal by ID
  getMealById: async (id) => {
    const response = await api.get(`/meals/${id}`);
    return response.data;
  },

  // Get recommendations for a student with enhanced options
  getRecommendations: async (options = {}) => {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    
    const response = await api.get(`/meals/recommend/me?${params}`);
    return response.data;
  },

  // Rate a meal
  rateMeal: async (mealId, rating) => {
    const response = await api.post(`/meals/${mealId}/rate`, { rating });
    return response.data;
  },

  // Create meal (admin)
  createMeal: async (mealData) => {
    const response = await api.post('/meals', mealData);
    return response.data;
  },

  // Update meal (admin)
  updateMeal: async (id, mealData) => {
    const response = await api.put(`/meals/${id}`, mealData);
    return response.data;
  },

  // Delete meal (admin)
  deleteMeal: async (id) => {
    const response = await api.delete(`/meals/${id}`);
    return response.data;
  },

  // Bulk import meals (admin)
  bulkImportMeals: async (meals) => {
    const response = await api.post('/meals/bulk-import', { meals });
    return response.data;
  },

  // Search meals with advanced filtering
  searchMeals: async (searchTerm, filters = {}) => {
    const params = new URLSearchParams({ search: searchTerm });
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    
    const response = await api.get(`/meals/search?${params}`);
    return response.data;
  }
};

// Enhanced student API functions
export const studentAPI = {
  // Create or update student profile
  createOrUpdateProfile: async (studentData) => {
    const response = await api.post('/students/me', studentData);
    return response.data;
  },

  // Get student profile by email
  getProfile: async () => {
    const response = await api.get('/students/me');
    return response.data;
  },

  // Get all students (admin)
  getAllStudents: async () => {
    const response = await api.get('/students');
    return response.data;
  },

  // Record meal feedback
  recordFeedback: async (mealId, liked) => {
    const response = await api.post('/students/me/feedback', {
      mealId,
      liked
    });
    return response.data;
  },

  // Delete student profile
  deleteProfile: async () => {
    const response = await api.delete('/students/me');
    return response.data;
  }
};

// System API functions
export const systemAPI = {
  // Login for admin
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
  },
  registerStudent: async (email, password) => {
    const response = await api.post('/auth/register', { email, password });
    return response.data;
  },
  me: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  // Health check
  healthCheck: async () => {
    const response = await api.get('/health');
    return response.data;
  },

  // API info
  getApiInfo: async () => {
    const response = await api.get('/');
    return response.data;
  }
};

// Utility functions
export const apiUtils = {
  // Handle API errors
  handleError: (error) => {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    if (error.message) {
      return error.message;
    }
    return 'An unexpected error occurred';
  },

  // Format meal data for display
  formatMealData: (meal) => ({
    ...meal,
    formattedCalories: `${meal.calories} kcal`,
    formattedProtein: `${meal.protein}g protein`,
    formattedCarbs: meal.carbohydrates ? `${meal.carbohydrates}g carbs` : '',
    formattedFats: meal.fats ? `${meal.fats}g fats` : '',
    nutritionSummary: `${meal.calories} cal • ${meal.protein}g protein`,
    ratingDisplay: meal.averageRating ? `${meal.averageRating.toFixed(1)} ⭐ (${meal.totalRatings})` : 'No ratings'
  }),

  // Validate email
  validateEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Get cuisine color for UI
  getCuisineColor: (cuisine) => {
    const colors = {
      'North Indian': 'bg-orange-300 text-black',
      'South Indian': 'bg-green-300 text-black',
      'Street Food': 'bg-yellow-300 text-black',
      'General': 'bg-gray-100 text-gray-900'
    };
    return colors[cuisine] || colors['General'];
  },

  // Get category icon
  getCategoryIcon: (category) => {
    const icons = {
      'Main Dish': '🍽️',
      'Breakfast': '🌅',
      'Snack': '🍿',
      'Side Dish': '🥗',
      'Staple': '🍚'
    };
    return icons[category] || '🍽️';
  },

  // Get diet preference color
  getDietColor: (diet) => {
    return diet === 'Vegetarian' 
      ? 'bg-green-300 text-black' 
      : 'bg-orange-300 text-black';
  }
};

export default api;
