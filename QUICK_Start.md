### 1. Clone and Setup

```bash
git clone https://github.com/Minhaj225/NutriGoal.git
cd meal-recommender-ai
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI and configuration
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your API URLs
npm run dev
```

### 4. ML Service Setup

```bash
cd ml
pip install -r requirements.txt
cd api
python app.py
```

### 5. Database Seeding

```bash
cd backend
npm run seed  # Populate database with sample meals
```