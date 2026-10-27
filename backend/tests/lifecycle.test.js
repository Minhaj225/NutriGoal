process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Meal = require('../models/Meal');
const Student = require('../models/Student');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { connectDb } = require('../db');
const { startServer, stopServer } = require('../server');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');

afterAll(cleanupTestDatabase);

test('importing app in local runtime does not connect or listen', () => {
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(join(__dirname, '../app.js'))}); setTimeout(() => process.exit(0), 150)`], {
    cwd: '/tmp', encoding: 'utf8', timeout: 3000,
    env: { PATH: process.env.PATH, NODE_ENV: 'development', RATE_LIMIT_MODE: 'memory',
      JWT_SECRET: process.env.JWT_SECRET, MONGO_URI: 'mongodb://127.0.0.1:1/nutrigoal_test' },
  });
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain('Server running');
});

test('liveness stays cheap while readiness reports a disconnected database', async () => {
  expect((await request(app).get('/api/health')).status).toBe(200);
  expect((await request(app).get('/api/ready')).status).toBe(503);
});

test('readiness connects on a healthy cold request', async () => {
  const oldEnv = process.env.NODE_ENV;
  const oldUri = process.env.MONGO_URI;
  const uri = new URL(process.env.TEST_MONGO_URI);
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(uri.hostname);
  expect(uri.pathname).toBe('/nutrigoal_test');
  uri.searchParams.set('directConnection', 'true');
  process.env.NODE_ENV = 'development';
  process.env.MONGO_URI = uri.toString();
  try {
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body.components.database).toBe('ready');
  } finally {
    await mongoose.disconnect();
    process.env.NODE_ENV = oldEnv;
    if (oldUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = oldUri;
  }
});

test('concurrent DB requests share one connection attempt and retry after failure', async () => {
  let complete;
  const connect = jest.spyOn(mongoose, 'connect')
    .mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  try {
    const first = connectDb('mongodb://127.0.0.1:27018/nutrigoal_test');
    const second = connectDb('mongodb://127.0.0.1:27018/nutrigoal_test');
    expect(first).toBe(second);
    expect(connect).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      maxPoolSize: 5, minPoolSize: 0, serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 5000 }));
    complete(mongoose);
    await first;
    connect.mockRejectedValueOnce(new Error('offline'));
    await expect(connectDb('mongodb://127.0.0.1:27018/nutrigoal_test')).rejects.toThrow('offline');
    connect.mockResolvedValueOnce(mongoose);
    await connectDb('mongodb://127.0.0.1:27018/nutrigoal_test');
    expect(connect).toHaveBeenCalledTimes(3);
  } finally { connect.mockRestore(); }
});

test('failed database connection returns 503 and local startup never listens', async () => {
  const oldEnv = process.env.NODE_ENV;
  const oldUri = process.env.MONGO_URI;
  process.env.NODE_ENV = 'development';
  process.env.MONGO_URI = 'mongodb://127.0.0.1:1/nutrigoal_test';
  const connect = jest.spyOn(mongoose, 'connect').mockRejectedValue(new Error('offline'));
  const listen = jest.spyOn(app, 'listen');
  try {
    expect((await request(app).get('/api')).status).toBe(503);
    await expect(startServer(0)).rejects.toThrow('offline');
    expect(listen).not.toHaveBeenCalled();
  } finally {
    connect.mockRestore(); listen.mockRestore();
    process.env.NODE_ENV = oldEnv;
    if (oldUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = oldUri;
  }
});

test('local shutdown closes its listener before disconnecting the database', async () => {
  const steps = [];
  const disconnect = jest.spyOn(mongoose, 'disconnect').mockImplementation(async () => { steps.push('database'); });
  try {
    await stopServer({ close: callback => { steps.push('listener'); callback(); } });
    expect(steps).toEqual(['listener', 'database']);
  } finally { disconnect.mockRestore(); }
});

test('statistics use only current authenticated rating sums and refresh after writes', async () => {
  await connectTestDatabase();
  const empty = await request(app).get('/api/meals/stats');
  expect(empty.body.stats).toMatchObject({ totalMeals: 0, averageRating: null, ratingCount: 0 });
  const base = { cuisine: 'General', category: 'Main Dish', dietaryPreference: 'Vegetarian',
    calories: 200, protein: 10 };
  await Meal.create({ ...base, mealName: 'One', isActive: true, ratingSummaryVersion: 2,
    totalRatings: 1, ratingSum: 5, averageRating: 5 });
  await Meal.create({ ...base, mealName: 'Two', isActive: true, ratingSummaryVersion: 2,
    totalRatings: 3, ratingSum: 3, averageRating: 1 });
  await Meal.create({ ...base, mealName: 'Unrated', isActive: true });
  const current = await request(app).get('/api/meals/stats');
  expect(current.body.stats).toMatchObject({ totalMeals: 3, averageRating: 2, ratingCount: 4 });
  expect((await request(app).get('/api/ready')).status).toBe(200);
  await Meal.updateOne({ mealName: 'One' }, { ratingSum: 1, averageRating: 1 });
  expect((await request(app).get('/api/meals/stats')).body.stats.averageRating).toBe(1);
});

test('admin can clear optional meal macros', async () => {
  const admin = await User.create({ username: 'macro-admin', email: 'macro-admin@example.com',
    password: 'Password123!', role: 'admin' });
  const token = jwt.sign({ id: String(admin.id), role: 'admin' }, process.env.JWT_SECRET,
    { algorithm: 'HS256' });
  const meal = await Meal.create({ mealName: 'Macro Meal', cuisine: 'General', category: 'Main Dish',
    dietaryPreference: 'Vegetarian', calories: 250, protein: 12, carbohydrates: 30, fats: 8 });
  const response = await request(app).put(`/api/meals/${meal.id}`)
    .set('Authorization', `Bearer ${token}`).send({ carbohydrates: null, fats: null });
  expect(response.status).toBe(200);
  const saved = await Meal.findById(meal.id);
  expect(saved.carbohydrates).toBeNull();
  expect(saved.fats).toBeNull();
});

test('equal-sort meal pages are stable and profile reads exclude embedded history', async () => {
  const pages = await Promise.all([1, 2].map(page => request(app)
    .get(`/api/meals?sortBy=calories&limit=2&page=${page}`)));
  const ids = pages.flatMap(response => response.body.meals.map(meal => meal._id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual([...ids].sort());
  const user = await User.create({ username: 'reader@example.com', email: 'reader@example.com',
    password: 'Password123!', role: 'student' });
  await Student.create({ name: 'Reader', email: 'reader@example.com', userId: user.id,
    mealHistory: [{ mealId: ids[0], liked: true, consumedAt: new Date() }] });
  const token = jwt.sign({ id: String(user.id), role: 'student' }, process.env.JWT_SECRET,
    { algorithm: 'HS256' });
  const profile = await request(app).get('/api/students/me').set('Authorization', `Bearer ${token}`);
  expect(profile.status).toBe(200);
  expect(profile.body.student).not.toHaveProperty('mealHistory');
});
