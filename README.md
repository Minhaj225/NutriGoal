# NutriGoal - AI Meal Recommender System

NutriGoal is a full-stack meal recommendation platform with a React frontend, an Express + MongoDB backend, and a Flask-based ML service.

It provides profile-driven recommendations, nutrition-aware filtering, meal rating/feedback, and a secure admin dashboard for meal management.

## System Architecture

```
Frontend (React + Vite)
       |
       | HTTP (Axios) + JWT
       v
Backend API (Express + MongoDB)
       |
       | HTTP
       v
ML API (Flask + scikit-learn)
```

## Project Structure

```
NutriGoal/
├── LICENSE
├── QUICK_Start.md
├── README.md
├── backend/
│   ├── app.js
│   ├── package.json
│   ├── package-lock.json
│   ├── vercel.json
│   ├── middleware/
│   │   └── auth.js             # JWT and Role-based access control
│   ├── models/
│   │   ├── Meal.js
│   │   ├── Student.js
│   │   └── User.js             # Admin user model
│   ├── routes/
│   │   ├── authRoutes.js       # Admin authentication endpoints
│   │   ├── mealRoutes.js       # Meal management & stats
│   │   └── studentRoutes.js    # Student profile & feedback
│   └── scripts/
│       ├── seedMeals.js
│       └── createAdmin.js      # Script to initialize admin user
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── eslint.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   ├── vercel.json
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css
│       ├── components/
│       │   ├── common/
│       │   │   ├── ErrorMessage.jsx
│       │   │   ├── LoadingSpinner.jsx
│       │   │   ├── Navigation.jsx
│       │   │   └── icons/
│       │   │       ├── admin.png
│       │   │       ├── nav-logo.png
│       │   │       └── user.png
│       │   ├── extra/
│       │   │   └── TextType.jsx
│       │   └── meals/
│       │       └── MealCard.jsx
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── StudentForm.jsx
│       │   ├── Recommendations.jsx
│       │   ├── BrowseMeals.jsx
│       │   ├── AdminLogin.jsx
│       │   ├── AdminMealForm.jsx
│       │   └── DotGrid.jsx
│       └── services/
│           └── api.js
└── ml/
    ├── API_GUIDE.md
    ├── requirements.txt
    ├── test_api.py
    ├── vercel.json
    └── api/
		├── app.py
		├── indian_food_nutrition_dataset.csv
		└── model.pkl
```

## Technology Stack

### Frontend
- React 19
- Vite 7
- React Router DOM 7
- Tailwind CSS 4 + daisyUI
- Axios
- MUI

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Axios (ML API integration)
- CORS + dotenv
- jsonwebtoken + bcryptjs (Secure Auth)
- express-rate-limit (Brute-force protection)

### ML Service
- Python + Flask
- scikit-learn
- pandas
- numpy
- gunicorn

## Features Implemented

- **User Profiles**: Create, update, and retrieve student profiles by email.
- **Smart Browsing**: Meal discovery with advanced filters and built-in pagination.
- **AI Recommendations**: Personalized suggestions using a Flask-based ML batch prediction model.
- **Feedback Loop**: Meal rating system and consumption history tracking.
- **Secure Admin Panel**: 
    - JWT-based authentication and RBAC.
    - Complete Meal CRUD and CSV-based bulk import.
    - Student management and database oversight.
- **System Hardening**: Global rate limiting and protection against NoSQL Injection.
- **Real-time Stats**: Home page dashboard with global meal and cuisine analytics.

### In Detail:
- 3-tier architecture (React → Node/Express → Flask/Python ML)
- JWT authentication & RBAC (admin/staff roles)
- Rate limiting (express-rate-limit, 100 req/15min)
- NoSQL injection prevention via field allow-listing
- Random Forest classifier (scikit-learn) with pickle model persistence + fallback model
- Batch & single prediction endpoints with confidence scores
- MongoDB with Mongoose (CRUD, aggregation pipelines, pagination)
- Meal seeding from CSV, bulk CSV import
- Rating system (weighted average + popularity tracking)
- Student meal feedback/history tracking
- Multi-criteria recommendation sorting (ML confidence × rating)
- Graceful ML API degradation with fallback sorting
- Global error handling + 404 handler
- Vercel deployment configs for all 3 services
- Health check + API info endpoints
- React Router SPA with protected admin routes
- Axios interceptors (auto JWT attachment, 401/403 redirects, logging)
- Advanced filtering (cuisine, category, diet, calories, protein)
- Sorting (popularity, rating, calories, protein)
- Animated UI (GSAP typing effect, interactive dot grid)
- Jest + Supertest security test suite
- Admin dashboard with meal CRUD + ML feature display

## Getting Started

### Prerequisites
- Node.js 16+
- npm 8+
- Python 3.8+
- MongoDB Atlas or local MongoDB

### 1) Clone
```bash
git clone https://github.com/Minhaj225/NutriGoal.git
cd NutriGoal
```

### 2) Install Dependencies
```bash
# backend
cd backend && npm install

# frontend
cd ../frontend && npm install

# ml
cd ../ml && pip install -r requirements.txt
```

### 3) Configure Environment
Backend:
```bash
cd backend
cp .env.example .env
```
Frontend:
```bash
cd ../frontend
cp .env.example .env.local
```
Set values as needed in `.env` and `.env.local`.

### 4) Run Locally (3 terminals)
Terminal 1 - backend:
```bash
cd backend
npm run dev
```
Terminal 2 - frontend:
```bash
cd frontend
npm run dev
```
Terminal 3 - ML API:
```bash
cd ml/api
python app.py
```

### 5) Database Initialization (Optional)
```bash
cd backend
# Seed initial meals
npm run seed
# Create an admin account for the dashboard
npm run create-admin
```

## API Documentation

### Backend Base URL
- Local: `http://localhost:5001/api`

### Auth
- `POST /auth/login` - Admin login (returns JWT)

### Students
- `POST /students` - Create or update student profile
- `GET /students` - List students (admin, paginated)
- `GET /students/:email` - Fetch student profile
- `POST /students/:email/feedback` - Save meal feedback
- `DELETE /students/:email` - Delete profile (admin)

### Meals
- `GET /meals/stats` - Global meal and cuisine analytics (used on Home page)
- `POST /meals` - Create meal (admin)
- `GET /meals` - List meals (supports filters and pagination)
- `GET /meals/:id` - Get meal by id
- `GET /meals/recommend/:email` - Personalized recommendations
- `POST /meals/:id/rate` - Rate meal
- `PUT /meals/:id` - Update meal (admin)
- `DELETE /meals/:id` - Soft-delete meal (admin)
- `POST /meals/bulk-import` - Bulk import meals (admin)

### ML API Base URL
- Local: `http://localhost:5000`

### ML Endpoints
- `GET /` - ML service metadata
- `GET /features` - Model feature details
- `GET /health` - ML health check
- `POST /predict` - Single prediction
- `POST /predict_batch` - Batch prediction

## Environment Variables

### backend/.env
```env
MONGO_URI=mongodb://localhost:27017/meal-recommender
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
ML_API_URL=http://localhost:5000
JWT_SECRET=your_super_secret_key_here
ADMIN_USERNAME = admin
ADMIN_PASSWORD = admin123
```

### frontend/.env.local
```env
VITE_API_URL=http://localhost:5001/api
VITE_ML_API_URL=http://localhost:5000
VITE_APP_NAME=AI Meal Recommender
VITE_APP_VERSION=2.0.0
VITE_ENABLE_ML_PREDICTIONS=true
VITE_ENABLE_ADMIN_FEATURES=true
```

## Testing

Backend security tests:
```bash
cd backend
npm test
```
ML API test script:
```bash
cd ml
python test_api.py
```
Health checks:
```bash
curl http://localhost:5001/api/health
curl http://localhost:5000/health
```

## Notes
- The frontend service layer contains helper methods for endpoints such as `/meals/search`, `/students/:email/history`, and `/students/:email/preferences`; these are not currently implemented in backend routes.
- Admin access is secured via JWT authentication. Admin routes require an `Authorization: Bearer <token>` header.

## License
This project is licensed for personal and educational use only.
Commercial use is strictly prohibited without prior written permission from the author.
See the [LICENSE](LICENSE) file for full details.

Copyright (c) Muhammed Minhaj 2025. All rights reserved.

## Support
- Email: [minhajps25@gmail.com](mailto:minhajps25@gmail.com)
- Issues: [GitHub Issues](https://github.com/Minhaj225/NutriGoal/issues)
- LinkedIn: [minhajps](https://www.linkedin.com/in/minhajps/)
