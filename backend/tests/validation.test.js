process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const request = require('supertest');
const app = require('../app');
const Meal = require('../models/Meal');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

afterEach(() => jest.restoreAllMocks());

test.each([
  'page=0', 'page=-1', 'page=1.5', 'page=1junk', 'page=99999999999999999999', 'page=1&page=2',
  'limit=0', 'limit=-1', 'limit=1.5', 'limit=101', 'limit=foo', 'limit=1&limit=2',
  'cuisine[$ne]=x', 'cuisine=Unknown', 'category=Unknown', 'dietaryPreference=Unknown', 'sortBy=Unknown',
  'minCalories=-1', 'minCalories=NaN', 'minCalories=Infinity', 'minCalories=1junk',
  'minCalories=20&maxCalories=10', 'minProtein=-1',
])('invalid meal query %s returns 400 before a model call', async (query) => {
  const count = jest.spyOn(Meal, 'countDocuments').mockResolvedValue(0);
  const find = jest.spyOn(Meal, 'find').mockImplementation(() => ({
    sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }),
  }));
  const response = await request(app).get(`/api/meals?${query}`);
  expect(response.status).toBe(400);
  expect(count).not.toHaveBeenCalled();
  expect(find).not.toHaveBeenCalled();
});

test('invalid meal ID returns 400 before lookup', async () => {
  const find = jest.spyOn(Meal, 'findById').mockResolvedValue(null);
  const response = await request(app).get('/api/meals/not-an-id');
  expect(response.status).toBe(400);
  expect(find).not.toHaveBeenCalled();
});

test.each(['5', true, 2.5, 0, 6, null])('invalid rating %s returns 400 before lookup', async (rating) => {
  const userId = '000000000000000000000002';
  const token = jwt.sign({ id: userId, role: 'student' }, process.env.JWT_SECRET);
  jest.spyOn(User, 'findById').mockReturnValue({ select: async () => ({ _id: userId, username: 'student@example.com', email: 'student@example.com', role: 'student' }) });
  const find = jest.spyOn(Meal, 'findById').mockResolvedValue(null);
  const response = await request(app).post('/api/meals/000000000000000000000001/rate').set('Authorization', `Bearer ${token}`).send({ rating });
  expect(response.status).toBe(400);
  expect(find).not.toHaveBeenCalled();
});

test('malformed and oversized JSON return 400 and 413', async () => {
  const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"');
  expect(malformed.status).toBe(400);
  const oversized = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'x'.repeat(1100000) });
  expect(oversized.status).toBe(413);
});
