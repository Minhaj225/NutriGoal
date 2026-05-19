# NutriGoal - AI Meal Recommender System

NutriGoal is a full-stack meal recommendation platform with a React frontend, an Express + MongoDB backend, and a Flask-based ML service.

It provides profile-driven recommendations, nutrition-aware filtering, meal rating/feedback, and admin meal management.

## System Architecture

```
Frontend (React + Vite)
       |
       | HTTP (Axios)
       v
Backend API (Express + MongoDB)
       |
       | HTTP
       v
ML API (Flask + scikit-learn)
```

## Project Structure (Current)

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
│   ├── models/
│   │   ├── Meal.js
│   │   └── Student.js
│   ├── routes/
│   │   ├── mealRoutes.js
│   │   └── studentRoutes.js
│   └── scripts/
│       └── seedMeals.js
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
- jsonwebtoken + bcryptjs (Auth)
- express-rate-limit (Security)


### ML Service

- Python + Flask
- scikit-learn
- pandas
- numpy
- gunicorn

## Features Implemented

- Student profile create/update and retrieval by email
- Meal browse with filters (cuisine, category, diet, calories, protein) and pagination
- Personalized recommendations via backend + ML batch prediction
- Fallback recommendations when ML service is unavailable
- Meal rating and student feedback tracking
- Admin meal CRUD, CSV-based bulk import, and student management
- Secure JWT-based authentication and RBAC for admin features
- Global rate limiting and NoSQL injection protection

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

### 5) Seed Meals (optional)

```bash
cd backend
npm run seed
```

## API Documentation (Current)

### Backend Base URL

- Local: `http://localhost:5001`

### System
 
- `GET /` - Backend root info
- `GET /api` - API metadata
- `GET /api/health` - Health check
 
### Auth
 
- `POST /api/auth/login` - Admin login (returns JWT)
 
### Students
 
- `POST /api/students` - Create or update student profile
- `GET /api/students` - List students (admin view, supports pagination)
- `GET /api/students/:email` - Fetch student profile
- `POST /api/students/:email/feedback` - Save meal feedback
- `DELETE /api/students/:email` - Delete profile (admin)
 
### Meals
 
- `POST /api/meals` - Create meal (admin)
- `GET /api/meals` - List meals (supports filters and pagination)
- `GET /api/meals/:id` - Get meal by id
- `GET /api/meals/recommend/:email` - Personalized recommendations
- `POST /api/meals/:id/rate` - Rate meal
- `PUT /api/meals/:id` - Update meal (admin)
- `DELETE /api/meals/:id` - Soft-delete meal (admin)
- `POST /api/meals/bulk-import` - Bulk import meals (admin)


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
