const express = require("express");
const { randomUUID } = require('node:crypto');
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Redis } = require("@upstash/redis");
const RedisStore = require("rate-limit-redis");
require("dotenv").config();

const studentRoutes = require("./routes/studentRoutes");
const mealRoutes = require("./routes/mealRoutes");
const authRoutes = require("./routes/authRoutes");
const { authenticateToken, authorizeAdmin } = require("./middleware/auth");

const app = express();

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "https://nutrigoalmain.vercel.app"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Global Rate Limiting

// Redis client for rate limiting - using Upstash Redis for Vercel compatibility
let redisStore;
try {
  const redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  redisStore = new RedisStore({
    sendCommand: (command, ...args) => redisClient.call(command, ...args),
    prefix: "rl:",
  });
} catch (err) {
  console.warn(
    "Upstash Redis unavailable, falling back to memory store:",
    err.message,
  );
}

const limiterOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests, please try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
};

// Use Redis store if available, otherwise fall back to memory store
if (redisStore) {
  limiterOptions.store = redisStore;
}
const limiter = rateLimit(limiterOptions);
app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set('X-Request-ID', req.requestId);
  res.on('finish', () => {
    console.log(`${req.requestId} ${req.method} ${req.baseUrl}${req.route?.path || '[unmatched]'} ${res.statusCode}`);
  });
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/meals", mealRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Meal Recommender Backend API",
    version: "2.0.0",
    status: "running",
    endpoints: {
      "/api": "API information",
      "/api/health": "Health check",
      "/api/students": "Student management",
      "/api/meals": "Meal management"
    }
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    dbStatus: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// API info endpoint
app.get("/api", (req, res) => {
  res.json({
    name: "Meal Recommender Backend API",
    version: "2.0.0",
    description: "Enhanced backend API for AI-powered meal recommendations",
    endpoints: {
      "/api/health": "GET - API health check",
      "/api/students": "Student management endpoints",
      "/api/meals": "Meal management and recommendation endpoints"
    },
    mlIntegration: {
      enabled: true,
      apiUrl: process.env.ML_API_URL || "http://localhost:5000"
    }
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    availableEndpoints: ["/api", "/api/health", "/api/students", "/api/meals"]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`${req.requestId || 'unparsed'} ${req.method} ${req.baseUrl}${req.route?.path || '[unmatched]'} ${err.name}`);
  if (err.status === 413 || err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body' });
  if (err.status === 400) return res.status(400).json({ error: err.message || 'Invalid request' });
  if (err.status === 403) return res.status(403).json({ error: err.message });
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: "Validation Error"
    });
  }
  
  // Mongoose cast error
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: "Invalid ID format",
      details: 'Invalid ID'
    });
  }
  
  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      error: "Duplicate entry",
      details: "A record with this information already exists"
    });
  }
  
  // Default error
  res.status(500).json({
    error: "Internal Server Error"
  });
});

// DB Connection
if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log("MongoDB connected successfully");
    console.log(`Database: ${mongoose.connection.db.databaseName}`);
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
}

// MongoDB connection event handlers
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

const PORT = process.env.PORT || 5001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`ML API URL: ${process.env.ML_API_URL || 'http://localhost:5000'}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  });
}

module.exports = app;
