process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Student = require('../models/Student');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');

const password = 'LongSecurePass123!';
const register = email => request(app).post('/api/auth/register').send({ email, password });

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([User.init(), Student.init()]);
  await Student.create({ name: 'Legacy', email: 'Legacy@Example.com' });
});

afterAll(cleanupTestDatabase);

test('anonymous profile and recommendation access is denied', async () => {
  expect((await request(app).get('/api/students/me')).status).toBe(401);
  expect((await request(app).post('/api/students/me').send({ name: 'Anon' })).status).toBe(401);
  expect((await request(app).get('/api/students/Legacy@Example.com')).status).toBe(401);
  expect((await request(app).get('/api/meals/recommend/me')).status).toBe(401);
});

test('role injection and legacy profile claiming are rejected before account creation', async () => {
  const query = jest.spyOn(Student, 'findOne');
  const injected = await request(app).post('/api/auth/register').send({ email: 'evil@example.com', password, role: 'admin' });
  expect(injected.status).toBe(400);
  expect(query).not.toHaveBeenCalled();
  query.mockRestore();

  const legacy = await register(' legacy@example.com ');
  expect(legacy.status).toBe(409);
  expect(legacy.body.error).toBe('profile_claim_required');
  expect(await User.findOne({ email: 'legacy@example.com' })).toBeNull();
});

test('one account owns one canonical profile and cannot use another email alias', async () => {
  const alice = await register('Alice@Example.com');
  const bob = await register('bob@example.com');
  expect(alice.status).toBe(201);
  expect(bob.status).toBe(201);
  const a = `Bearer ${alice.body.token}`;
  const b = `Bearer ${bob.body.token}`;

  expect((await request(app).post('/api/students/me').set('Authorization', a).send({ name: 'Alice' })).status).toBe(200);
  expect((await request(app).post('/api/students/me').set('Authorization', b).send({ name: 'Bob' })).status).toBe(200);
  const mine = await request(app).get('/api/students/me').set('Authorization', a);
  expect(mine.status).toBe(200);
  expect(mine.body.student.email).toBe('alice@example.com');
  expect(String(mine.body.student.userId)).toBe(alice.body.id);

  expect((await request(app).get('/api/students/bob@example.com').set('Authorization', a)).status).toBe(403);
  expect((await request(app).post('/api/students').set('Authorization', a).send({ email: 'bob@example.com', name: 'Changed' })).status).toBe(403);
  expect((await request(app).get('/api/meals/recommend/bob@example.com').set('Authorization', a)).status).toBe(403);
  expect((await Student.findOne({ email: 'bob@example.com' })).name).toBe('Bob');

  const duplicate = await register('ALICE@example.com');
  expect(duplicate.status).toBe(409);
});

test('profile create rejects missing name and selector input without writes', async () => {
  const account = await register('clean@example.com');
  const token = `Bearer ${account.body.token}`;
  const created = await request(app).post('/api/students/me').set('Authorization', token).send({ preferences: { dietaryPreference: 'Vegetarian' } });
  expect(created.status).toBe(400);
  const injected = await request(app).post('/api/students/me').set('Authorization', token).send({ name: 'Clean', email: { $ne: null } });
  expect(injected.status).toBe(400);
  expect(await Student.findOne({ userId: account.body.id })).toBeNull();
});

test('nested operators and oversized profile data fail before profile lookup', async () => {
  const account = await register('boundary@example.com');
  const token = `Bearer ${account.body.token}`;
  for (const body of [
    { name: 'Boundary', preferences: { dietaryPreference: { $ne: null } } },
    { name: 'Boundary', preferences: { $set: { cuisines: [] } } },
    { name: 'Boundary', allergies: Array(31).fill('nuts') },
    { name: 'Boundary', nutritionGoals: { caloriesPerDay: '2000' } },
    { name: 'x'.repeat(121) },
  ]) {
    const lookup = jest.spyOn(Student, 'findOne');
    const response = await request(app).post('/api/students/me').set('Authorization', token).send(body);
    expect(response.status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockRestore();
  }
  expect(await Student.findOne({ userId: account.body.id })).toBeNull();
});

test('partial profile updates preserve siblings and only the owner can delete', async () => {
  const alice = await register('partial@example.com');
  const bob = await register('other@example.com');
  const a = `Bearer ${alice.body.token}`;
  const b = `Bearer ${bob.body.token}`;
  await request(app).post('/api/students/me').set('Authorization', a).send({
    name: 'Partial', preferences: { cuisines: ['North Indian'], categories: ['Main Dish'], dietaryPreference: 'Vegetarian' },
  });
  const update = await request(app).post('/api/students/me').set('Authorization', a)
    .send({ preferences: { dietaryPreference: 'Non-Vegetarian' } });
  expect(update.status).toBe(200);
  expect(update.body.student.preferences).toMatchObject({
    cuisines: ['North Indian'], categories: ['Main Dish'], dietaryPreference: 'Non-Vegetarian',
  });
  expect((await request(app).delete('/api/students/partial@example.com').set('Authorization', b)).status).toBe(403);
  expect((await request(app).delete('/api/students/me').set('Authorization', a)).status).toBe(200);
  expect(await Student.findOne({ userId: alice.body.id })).toBeNull();
});

test('personalized endpoints reject malformed queries and do not cache private responses', async () => {
  const account = await register('personal@example.com');
  const token = `Bearer ${account.body.token}`;
  for (const path of ['/api/meals/recommend/me?limit=0', '/api/meals/recommend/me?limit=2&limit=3',
    '/api/meals/recommend/me?mealType[$ne]=Main%20Dish']) {
    const lookup = jest.spyOn(Student, 'findOne');
    const response = await request(app).get(path).set('Authorization', token);
    expect(response.status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockRestore();
  }
  const profile = await request(app).get('/api/students/me').set('Authorization', token);
  expect(profile.headers['cache-control']).toBe('no-store');
  const me = await request(app).get('/api/auth/me').set('Authorization', token);
  expect(me.headers['cache-control']).toBe('no-store');
  expect(me.body).toEqual({ id: account.body.id, username: 'personal@example.com', email: 'personal@example.com', role: 'student' });
});

test('admin can inspect and delete an unclaimed legacy profile without making it claimable', async () => {
  await User.create({ username: 'ownership-admin', password, role: 'admin' });
  const login = await request(app).post('/api/auth/login').send({ username: 'ownership-admin', password });
  const token = `Bearer ${login.body.token}`;
  const legacy = await request(app).get('/api/students/legacy@example.com').set('Authorization', token);
  expect(legacy.status).toBe(200);
  expect(legacy.body.student.userId).toBeUndefined();
  expect((await request(app).get('/api/students?page=0').set('Authorization', token)).status).toBe(400);
  expect((await request(app).delete('/api/students/legacy@example.com').set('Authorization', token)).status).toBe(200);
});
