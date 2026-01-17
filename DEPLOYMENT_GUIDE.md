# Deployment Guide: Meal Recommender Monorepo

This guide details how to deploy your **Meal Recommender** project to **Vercel**. Due to the different environments required for each component (React, Node.js, Python/Flask), we will deploy them as **3 separate Vercel projects** linked together.

## Prerequisites

- [Vercel Account](https://vercel.com/)
- [Vercel CLI](https://vercel.com/docs/cli) installed (optional, but recommended for debugging).
- Your project pushed to a Git repository (GitHub/GitLab/Bitbucket).

---

## 1. Deploying the ML Service (Python/Flask)

This service hosts your Recommendation Engine.

1.  Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..."** -> **"Project"**.
2.  Import your repository.
3.  **Configure Project**:
    - **Project Name**: `meal-recommender-ml` (or similar).
    - **Root Directory**: Click "Edit" and select `ml`.
    - **Framework Preset**: Select "Other" (Vercel usually auto-detects, but "Other" is safe for custom Python).
4.  **Environment Variables**:
    - Add any variables from `ml/.env` (if any are needed for production).
5.  Click **Deploy**.

> **Note on Size Limits**: The ML service uses `pandas` and `scikit-learn`. Vercel allows up to 250MB (uncompressed) for Serverless Functions. If your deployment fails due to size, check the build logs. You may need to remove unused dependencies from `requirements.txt` or use a dedicated hosting service like **Railway** or **Render** for the ML part.

**After Deployment**: Copy the production URL (e.g., `https://meal-recommender-ml.vercel.app`).

---

## 2. Deploying the Backend (Node.js/Express)

This service handles your main API logic and users.

1.  Go to your Vercel Dashboard -> **"Add New..."** -> **"Project"**.
2.  Import the **same repository** again.
3.  **Configure Project**:
    - **Project Name**: `meal-recommender-backend`.
    - **Root Directory**: Click "Edit" and select `backend`.
    - **Framework Preset**: "Other" (or "Node.js").
4.  **Environment Variables**:
    - `ML_API_URL`: Paste the **ML Service URL** from Step 1 (e.g., `https://meal-recommender-ml.vercel.app`).
    - Add other variables from `backend/.env` (e.g., `MONGODB_URI`, `JWT_SECRET`).
5.  Click **Deploy**.

**After Deployment**: Copy the production URL (e.g., `https://meal-recommender-backend.vercel.app`).

---

## 3. Deploying the Frontend (React/Vite)

This is the user interface.

1.  Go to your Vercel Dashboard -> **"Add New..."** -> **"Project"**.
2.  Import the **same repository** one last time.
3.  **Configure Project**:
    - **Project Name**: `meal-recommender-frontend`.
    - **Root Directory**: Click "Edit" and select `react-frontend`.
    - **Framework Preset**: "Vite".
4.  **Environment Variables**:
    - `VITE_API_URL`: Paste the **Backend Service URL** from Step 2 (e.g., `https://meal-recommender-backend.vercel.app`).
    - *Note: Ensure your React code uses `import.meta.env.VITE_API_URL` to make requests.*
5.  Click **Deploy**.

---

## Verification

1.  Open your **Frontend URL**.
2.  Login/Register (tests Backend).
3.  Request a Meal Recommendation (tests Backend -> ML communication).

## Troubleshooting

-   **CORS Errors**: If you see CORS errors in the browser console:
    -   Check `backend/app.js` (or `server.js`) and ensure `cors` is configured to allow your Frontend URL.
    -   Check `ml/api.py` and ensure `CORS(app)` is enabled and allows the Backend URL (if the backend calls it) or Frontend URL (if the frontend calls it directly).
-   **ML 500 Error**: Check Vercel logs for the ML project. It usually means a missing dependency or memory issue.
