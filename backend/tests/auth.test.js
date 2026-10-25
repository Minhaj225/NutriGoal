process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const { spawnSync } = require('node:child_process');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');

const meal = {
  mealName: 'Test Dal', cuisine: 'North Indian', category: 'Main Dish',
  dietaryPreference: 'Vegetarian', calories: 180, protein: 9,
};

beforeAll(async () => {
  await connectTestDatabase();
  await User.init();
  await User.create({ username: 'admin', password: 'Password123!', role: 'admin' });
  await User.create({ username: 'staff', password: 'Password123!', role: 'staff' });
});

afterAll(cleanupTestDatabase);

test('login token authenticates one admin write and me hides password', async () => {
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Password123!' });
  expect(login.status).toBe(200);
  expect(login.body.role).toBe('admin');
  expect(login.body.token).toEqual(expect.any(String));

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
  expect(me.status).toBe(200);
  expect(me.body).toEqual({ id: expect.any(String), username: 'admin', role: 'admin' });

  const created = await request(app).post('/api/meals').set('Authorization', `Bearer ${login.body.token}`).send(meal);
  expect(created.status).toBe(200);
  expect(created.body.meal.mealName).toBe('Test Dal');
});

test('staff token cannot write meals', async () => {
  const login = await request(app).post('/api/auth/login').send({ username: 'staff', password: 'Password123!' });
  expect(login.status).toBe(200);
  const response = await request(app).post('/api/meals').set('Authorization', `Bearer ${login.body.token}`).send(meal);
  expect(response.status).toBe(403);
});

test.each([
  [{ username: { $ne: null }, password: 'Password123!' }],
  [{ username: 'admin', password: true }],
  [{ username: 'admin', password: 'x'.repeat(73) }],
])('malformed credentials return 400', async (body) => {
  const response = await request(app).post('/api/auth/login').send(body);
  expect(response.status).toBe(400);
});

test('authorization requires a well-formed Bearer token', async () => {
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Password123!' });
  const response = await request(app).post('/api/meals').set('Authorization', `Basic ${login.body.token}`).send(meal);
  expect(response.status).toBe(401);
});

test('secret validation rejects missing and placeholder values', () => {
  const { getJwtSecret } = require('../config');
  expect(() => getJwtSecret(null)).toThrow(/JWT_SECRET/);
  expect(() => getJwtSecret('default_secret_change_me')).toThrow(/JWT_SECRET/);
  expect(() => getJwtSecret(process.env.JWT_SECRET)).not.toThrow();
});

test('admin provisioning without credentials exits nonzero', () => {
  const env = { ...process.env };
  delete env.ADMIN_USERNAME;
  delete env.ADMIN_PASSWORD;
  delete env.MONGO_URI;
  const result = spawnSync(process.execPath, [__dirname + '/../scripts/createAdmin.js'], { cwd: '/tmp', env, encoding: 'utf8', timeout: 5000 });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/ADMIN_USERNAME|ADMIN_PASSWORD/);
});

test('new passwords enforce 12 to 72 UTF-8 bytes before bcrypt', async () => {
  await expect(User.create({ username: 'short', password: 'short', role: 'admin' })).rejects.toThrow(/12.*72|password/i);
  await expect(User.create({ username: 'long', password: 'é'.repeat(37), role: 'admin' })).rejects.toThrow(/12.*72|password/i);
});

test.each([undefined, 'default_secret_change_me'])('missing or placeholder secret stops startup', (secret) => {
  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.MONGO_URI;
  if (secret === undefined) delete env.JWT_SECRET;
  else env.JWT_SECRET = secret;
  const result = spawnSync(process.execPath, [__dirname + '/../app.js'], { cwd: '/tmp', env, encoding: 'utf8', timeout: 5000 });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/JWT_SECRET/);
});

test('an expired token is rejected with 401', async () => {
  const jwt = require('jsonwebtoken');
  const user = await User.findOne({ username: 'admin' });
  const token = jwt.sign({ id: String(user._id), role: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -1 });
  const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(401);
});

test('a demoted admin cannot keep using an old admin token', async () => {
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Password123!' });
  const user = await User.findOne({ username: 'admin' });
  user.role = 'staff';
  await user.save();
  try {
    const response = await request(app).post('/api/meals').set('Authorization', `Bearer ${login.body.token}`).send(meal);
    expect(response.status).toBe(401);
  } finally {
    user.role = 'admin';
    await user.save();
  }
});
