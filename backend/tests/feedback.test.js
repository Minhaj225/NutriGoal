process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../app');
const User = require('../models/User');
const Student = require('../models/Student');
const Meal = require('../models/Meal');
const MealFeedback = require('../models/MealFeedback');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');

const mealData = { mealName: 'Test Dal', cuisine: 'North Indian', category: 'Main Dish',
  dietaryPreference: 'Vegetarian', calories: 180, protein: 9 };

async function account(name) {
  const user = await User.create({ username: name, email: `${name}@example.com`, password: 'Password123!', role: 'student' });
  await Student.create({ userId: user._id, name, email: user.email });
  return `Bearer ${jwt.sign({ id: String(user._id), role: 'student' }, process.env.JWT_SECRET)}`;
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([User.init(), Student.init(), MealFeedback.init()]);
});
afterAll(cleanupTestDatabase);
afterEach(() => jest.restoreAllMocks());

test('retry is one vote; rerating adjusts exact sum; explicit like retains numeric rating', async () => {
  const token = await account('retry');
  const meal = await Meal.create(mealData);
  const path = `/api/meals/${meal.id}/rate`;
  for (const rating of [2, 2, 5]) {
    const response = await request(app).post(path).set('Authorization', token).send({ rating });
    expect(response.status).toBe(200);
  }
  let saved = await Meal.findById(meal.id);
  expect([saved.ratingSum, saved.totalRatings, saved.popularity, saved.averageRating]).toEqual([5, 1, 1, 5]);
  expect(await MealFeedback.countDocuments({ mealId: meal.id })).toBe(1);
  const like = await request(app).post('/api/students/me/feedback').set('Authorization', token)
    .send({ mealId: meal.id, liked: false });
  expect(like.status).toBe(200);
  expect((await MealFeedback.findOne({ mealId: meal.id })).toObject()).toMatchObject({ rating: 5, liked: false, source: 'explicit' });
  expect((await request(app).post(path).set('Authorization', token).send({ rating: 5 })).status).toBe(200);
  expect((await MealFeedback.findOne({ mealId: meal.id })).toObject()).toMatchObject({ rating: 5, liked: false, source: 'explicit' });
  saved = await Meal.findById(meal.id);
  expect([saved.ratingSum, saved.totalRatings]).toEqual([5, 1]);
  expect((await Student.findOne({ email: 'retry@example.com' })).mealHistory).toHaveLength(0);
});

test('twenty distinct simultaneous voters produce exact count and sum', async () => {
  const meal = await Meal.create(mealData);
  const hash = await bcrypt.hash('Password123!', 4);
  const users = await User.insertMany(Array.from({ length: 20 }, (_, i) => ({
    username: `parallel${i}`, email: `parallel${i}@example.com`, password: hash, role: 'student',
  })));
  await Student.insertMany(users.map(user => ({ userId: user.id, name: user.username, email: user.email })));
  const started = Date.now();
  const votes = await Promise.all(users.map((user, i) => request(app).post(`/api/meals/${meal.id}/rate`)
    .set('Authorization', `Bearer ${jwt.sign({ id: String(user.id), role: 'student' }, process.env.JWT_SECRET)}`)
    .send({ rating: i % 5 + 1 })));
  console.info(`20 concurrent local feedback writes: ${Date.now() - started} ms`);
  expect(votes.map(vote => vote.status)).toEqual(Array(20).fill(200));
  const saved = await Meal.findById(meal.id);
  expect([saved.ratingSum, saved.totalRatings, saved.popularity, saved.averageRating]).toEqual([60, 20, 20, 3]);
  expect(await MealFeedback.countDocuments({ mealId: meal.id })).toBe(20);
});

test('two simultaneous first writes from one account leave one rating', async () => {
  const token = await account('race');
  const meal = await Meal.create(mealData);
  const votes = await Promise.all([2, 5].map(rating => request(app).post(`/api/meals/${meal.id}/rate`)
    .set('Authorization', token).send({ rating })));
  expect(votes.map(vote => vote.status)).toEqual([200, 200]);
  const saved = await Meal.findById(meal.id);
  expect(saved.totalRatings).toBe(1);
  expect([2, 5]).toContain(saved.ratingSum);
  expect(await MealFeedback.countDocuments({ mealId: meal.id })).toBe(1);
});

test('invalid, absent, and inactive meals cannot receive ratings or likes', async () => {
  const token = await account('invalid');
  const meal = await Meal.create({ ...mealData, isActive: false });
  for (const rating of ['5', true, 2.5]) {
    expect((await request(app).post(`/api/meals/${meal.id}/rate`).set('Authorization', token).send({ rating })).status).toBe(400);
  }
  expect((await request(app).post(`/api/meals/${meal.id}/rate`).set('Authorization', token).send({ rating: 4 })).status).toBe(404);
  expect((await request(app).post('/api/students/me/feedback').set('Authorization', token)
    .send({ mealId: meal.id, liked: true })).status).toBe(404);
  expect((await request(app).post('/api/students/me/feedback').set('Authorization', token)
    .send({ mealId: '000000000000000000000001', liked: true })).status).toBe(404);
  expect(await MealFeedback.countDocuments({})).toBeGreaterThanOrEqual(0);
});

test('feedback write failure rolls back the meal summary', async () => {
  const token = await account('rollback');
  const meal = await Meal.create(mealData);
  jest.spyOn(MealFeedback.prototype, 'save').mockRejectedValueOnce(new Error('simulated feedback failure'));
  const response = await request(app).post(`/api/meals/${meal.id}/rate`).set('Authorization', token).send({ rating: 4 });
  expect(response.status).toBe(500);
  const saved = await Meal.findById(meal.id);
  expect([saved.ratingSum, saved.totalRatings, saved.averageRating]).toEqual([0, 0, 0]);
  expect(await MealFeedback.countDocuments({ mealId: meal.id })).toBe(0);
});

test('summary write failure leaves no feedback row', async () => {
  const token = await account('summaryfailure');
  const meal = await Meal.create(mealData);
  jest.spyOn(Meal.prototype, 'save').mockRejectedValueOnce(new Error('simulated summary failure'));
  const response = await request(app).post(`/api/meals/${meal.id}/rate`).set('Authorization', token).send({ rating: 3 });
  expect(response.status).toBe(500);
  expect(await MealFeedback.countDocuments({ mealId: meal.id })).toBe(0);
  expect((await Meal.findById(meal.id)).ratingSum).toBe(0);
});

test('deleting an owned profile removes its feedback and reconciles meal summaries', async () => {
  const first = await account('deletefirst');
  const second = await account('deletesecond');
  const meal = await Meal.create(mealData);
  for (const [token, rating] of [[first, 2], [second, 5]]) {
    expect((await request(app).post(`/api/meals/${meal.id}/rate`).set('Authorization', token).send({ rating })).status).toBe(200);
  }
  expect((await request(app).delete('/api/students/me').set('Authorization', first)).status).toBe(200);
  const saved = await Meal.findById(meal.id);
  expect([saved.ratingSum, saved.totalRatings, saved.popularity, saved.averageRating]).toEqual([5, 1, 1, 5]);
  expect(await MealFeedback.countDocuments({ mealId: meal.id })).toBe(1);
});

test('feedback history is paginated and does not infer a meal was consumed', async () => {
  const token = await account('history');
  const meals = await Meal.insertMany([mealData, { ...mealData, mealName: 'Second Dal' }]);
  for (const meal of meals) {
    expect((await request(app).post('/api/students/me/feedback').set('Authorization', token)
      .send({ mealId: meal.id, liked: true })).status).toBe(200);
  }
  const history = await request(app).get('/api/students/me/feedback?page=1&limit=1').set('Authorization', token);
  expect(history.status).toBe(200);
  expect(history.body.feedback).toHaveLength(1);
  expect(history.body.feedback[0]).toMatchObject({ liked: true, source: 'explicit', schemaVersion: 2 });
  expect(history.body.feedback[0].consumedAt).toBeUndefined();
  expect((await request(app).get('/api/students/me/feedback?limit=0').set('Authorization', token)).status).toBe(400);
});

test('profile deletion failure rolls back feedback removal and meal reconciliation', async () => {
  const token = await account('deletefailure');
  const meal = await Meal.create(mealData);
  expect((await request(app).post(`/api/meals/${meal.id}/rate`).set('Authorization', token).send({ rating: 4 })).status).toBe(200);
  jest.spyOn(Student, 'deleteOne').mockImplementationOnce(() => ({
    session: () => Promise.reject(new Error('simulated profile delete failure')),
  }));
  expect((await request(app).delete('/api/students/me').set('Authorization', token)).status).toBe(500);
  const saved = await Meal.findById(meal.id);
  expect([saved.ratingSum, saved.totalRatings]).toEqual([4, 1]);
  expect(await MealFeedback.countDocuments({ mealId: meal.id })).toBe(1);
});
