process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const app = require('../app');
const User = require('../models/User');
const Student = require('../models/Student');
const Meal = require('../models/Meal');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');
const { baselineRank, behavioralRank, validatePredictions } = require('../services/recommendations');

const fixture = (id, count = 0, sum = 0) => ({
  _id: id.padStart(24, '0'), mealName: id, ratingSummaryVersion: 2,
  totalRatings: count, ratingSum: sum, popularity: count,
  toObject() { const { toObject, ...fields } = this; return fields; },
});

test('baseline uses a bounded prior, log popularity, and stable ties', () => {
  const zero = fixture('1');
  const one = fixture('2', 1, 5);
  const many = fixture('3', 100, 400);
  const ranked = baselineRank([zero, one, many], 3);
  expect(ranked.map(meal => meal.mealName)).toEqual(['3', '2', '1']);
  expect(ranked[2].rankingScore).toBeCloseTo(0.36);
  expect(ranked[1].rankingScore).toBeCloseTo(0.6 * (20 / 30) + 0.4 * Math.log1p(1) / Math.log1p(100));
  expect(ranked.every(meal => meal.rankingScore >= 0 && meal.rankingScore <= 1 && meal.confidence === null)).toBe(true);
  expect(baselineRank([fixture('2'), fixture('1')], 2).map(meal => meal.mealName)).toEqual(['1', '2']);
  expect(baselineRank([fixture('4', 1, 5), fixture('5', 1000000, 5000000)], 2)[0].rankingScore).toBeLessThanOrEqual(1);
});

test('behavioral results are joined by ID and reject malformed or partial output', () => {
  const meals = [fixture('1'), fixture('2')];
  const reversed = { success: true, modelVersion: 'approved-v1', results: [
    { meal_id: meals[1]._id, recommended: true, confidence: 0.9 },
    { meal_id: meals[0]._id, recommended: false, confidence: 0.1 },
  ] };
  const predictions = validatePredictions(reversed, meals);
  expect(behavioralRank(meals, predictions, 2).map(meal => meal.mealName)).toEqual(['2']);
  expect(behavioralRank(meals, predictions, 2)[0].rankingScore).toBeCloseTo(0.7 * 0.9 + 0.3 * 0.6);
  for (const body of [
    { success: false, results: reversed.results },
    { success: true, results: reversed.results.slice(0, 1) },
    { success: true, results: [{ ...reversed.results[0], confidence: 2 }, reversed.results[1]] },
    { success: true, results: [{ ...reversed.results[0], meal_id: 'unknown' }, reversed.results[1]] },
    { success: true, results: [{ meal_id: meals[1]._id, error: 'bad row' }, reversed.results[1]] },
  ]) expect(() => validatePredictions(body, meals)).toThrow();
});

let token;
beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([User.init(), Student.init()]);
  const user = await User.create({ username: 'rank@example.com', email: 'rank@example.com', password: 'Password123!', role: 'student' });
  token = `Bearer ${jwt.sign({ id: String(user.id), role: 'student' }, process.env.JWT_SECRET)}`;
  await Student.create({ userId: user.id, name: 'Rank', email: user.email,
    allergies: ['milk'], preferences: { dietaryPreference: 'Vegetarian', categories: ['Main Dish'] } });
  await Meal.create({ mealName: 'Eligible', cuisine: 'General', category: 'Main Dish',
    dietaryPreference: 'Vegetarian', calories: 300, protein: 10,
    servingSize: '200g', allergenStatus: 'verified', allergens: [] });
  await Meal.create({ mealName: 'Milk', cuisine: 'General', category: 'Main Dish',
    dietaryPreference: 'Vegetarian', calories: 300, protein: 10,
    servingSize: '200g', allergenStatus: 'verified', allergens: ['milk'] });
});
afterAll(cleanupTestDatabase);
afterEach(() => { jest.restoreAllMocks(); delete process.env.RECOMMENDER_MODE;
  delete process.env.BEHAVIORAL_MODEL_APPROVED; delete process.env.ML_API_TOKEN;
  delete process.env.ML_MODEL_VERSION; });

test('default baseline never calls ML and preserves eligibility', async () => {
  const ml = jest.spyOn(axios, 'post');
  const response = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(response.status).toBe(200);
  expect(response.body.recommendationMode).toBe('baseline');
  expect(response.body.totalEligible).toBe(1);
  expect(response.body.recommendations.map(meal => meal.mealName)).toEqual(['Eligible']);
  expect(response.body.recommendations[0].confidence).toBeNull();
  expect(ml).not.toHaveBeenCalled();
});

test('ML timeout degrades promptly to the same safe baseline', async () => {
  process.env.RECOMMENDER_MODE = 'behavioral';
  process.env.BEHAVIORAL_MODEL_APPROVED = 'true';
  process.env.ML_API_TOKEN = 'local-secret';
  process.env.ML_MODEL_VERSION = 'v1';
  const ml = jest.spyOn(axios, 'post').mockImplementationOnce(async (_url, _body, options) => {
    await new Promise(resolve => setTimeout(resolve, options.timeout));
    throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
  });
  const started = Date.now();
  const response = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(Date.now() - started).toBeLessThan(10000);
  expect(response.status).toBe(200);
  expect(ml.mock.calls[0][2].timeout).toBe(2500);
  expect(response.body.recommendationMode).toBe('baseline');
  expect(response.body.degradedReason).toBe('model_unavailable');
  expect(response.body.recommendations.map(meal => meal.mealName)).toEqual(['Eligible']);
});

test('unapproved, malformed, and all-negative model outputs keep safe baseline meals', async () => {
  process.env.RECOMMENDER_MODE = 'behavioral';
  const ml = jest.spyOn(axios, 'post');
  const unapproved = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(unapproved.body.degradedReason).toBe('not_approved');
  expect(ml).not.toHaveBeenCalled();
  process.env.BEHAVIORAL_MODEL_APPROVED = 'true';
  process.env.ML_API_TOKEN = 'local-secret';
  process.env.ML_MODEL_VERSION = 'v1';
  ml.mockResolvedValueOnce({ data: { success: true, modelVersion: 'v1', results: [
    { meal_id: 'wrong', recommended: true, confidence: 0.9 },
  ] } });
  const malformed = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(malformed.body.degradedReason).toBe('invalid_model_response');
  expect(malformed.body.recommendations.map(meal => meal.mealName)).toEqual(['Eligible']);
  const eligible = await Meal.findOne({ mealName: 'Eligible' });
  ml.mockResolvedValueOnce({ data: { success: true, modelVersion: 'v1', results: [
    { meal_id: String(eligible.id), recommended: false, confidence: 0.1 },
  ] } });
  const negative = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(negative.body.degradedReason).toBe('no_positive_predictions');
  expect(negative.body.recommendations.map(meal => meal.mealName)).toEqual(['Eligible']);
  expect(ml.mock.calls[0][1].meals.map(meal => meal.meal_id)).toEqual([String(eligible.id)]);
  expect(ml.mock.calls[0][1].schemaVersion).toBe('behavioral-v1');
  expect(ml.mock.calls[0][1].modelVersion).toBe('v1');
  expect(ml.mock.calls[0][2].headers['X-ML-Token']).toBe('local-secret');
});

test('model features proxy requires admin and keeps the service token server-side', async () => {
  process.env.ML_API_TOKEN = 'local-secret';
  const admin = await User.create({ username: 'model-admin', email: 'model-admin@example.com',
    password: 'Password123!', role: 'admin' });
  const adminToken = `Bearer ${jwt.sign({ id: String(admin.id), role: 'admin' }, process.env.JWT_SECRET)}`;
  const ml = jest.spyOn(axios, 'get').mockResolvedValue({ data: { features: ['calories', 'protein'], modelVersion: 'test-v1' } });
  expect((await request(app).get('/api/meals/ml/features')).status).toBe(401);
  expect((await request(app).get('/api/meals/ml/features').set('Authorization', token)).status).toBe(403);
  const response = await request(app).get('/api/meals/ml/features').set('Authorization', adminToken);
  expect(response.status).toBe(200);
  expect(response.body.features).toEqual(['calories', 'protein']);
  expect(ml.mock.calls[0][1].headers['X-ML-Token']).toBe('local-secret');
  expect(JSON.stringify(response.body)).not.toContain('local-secret');
});

test('101 eligible candidates are all evaluated; 501 requests are narrowed', async () => {
  const candidates = Array.from({ length: 500 }, (_, i) => ({ mealName: `Candidate ${i}`,
    cuisine: 'General', category: 'Main Dish', dietaryPreference: 'Vegetarian',
    calories: 300, protein: 10, servingSize: '200g', allergenStatus: 'verified', allergens: [] }));
  await Meal.insertMany(candidates.slice(0, 100));
  const first = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(first.status).toBe(200);
  expect(first.body.totalMealsEvaluated).toBe(101);
  await Meal.insertMany(candidates.slice(100));
  const overflow = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(overflow.status).toBe(422);
  expect(overflow.body.error).toBe('narrow_preferences');
});
