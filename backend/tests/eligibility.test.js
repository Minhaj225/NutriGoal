process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const app = require('../app');
const User = require('../models/User');
const Student = require('../models/Student');
const Meal = require('../models/Meal');
const { buildEligibilityFilter } = require('../services/eligibility');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');

const base = { cuisine: 'North Indian', category: 'Main Dish', dietaryPreference: 'Vegetarian',
  calories: 300, protein: 20, servingSize: '200g' };
let allergyStudent;
let allergyUser;

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([User.init(), Student.init()]);
  allergyUser = await User.create({ username: 'allergy@example.com', email: 'allergy@example.com', password: 'Password123!', role: 'student' });
  allergyStudent = await Student.create({ userId: allergyUser.id, name: 'Allergy', email: allergyUser.email,
    allergies: [' DAIRY ', 'nutS'], preferences: { cuisines: ['North Indian'], categories: ['Main Dish'], dietaryPreference: 'Vegetarian' },
    nutritionGoals: { maxCaloriesPerMeal: 400, minProteinPerMeal: 10 } });
  const fixtures = [
    { mealName: 'Safe Dal', allergenStatus: 'verified', allergens: [] },
    { mealName: 'Milk Curry', allergenStatus: 'verified', allergens: ['MiLk'] },
    { mealName: 'Peanut Dal', allergenStatus: 'verified', allergens: ['peaNUT'] },
    { mealName: 'Unknown Dal', allergenStatus: 'unknown', allergens: [] },
    { mealName: 'Uncertain Dal', allergenStatus: 'unknown', allergens: ['may contain peanuts'] },
    { mealName: 'Meat Curry', allergenStatus: 'verified', allergens: [], dietaryPreference: 'Non-Vegetarian' },
    { mealName: 'Breakfast', allergenStatus: 'verified', allergens: [], category: 'Breakfast' },
    { mealName: 'Inactive Dal', allergenStatus: 'verified', allergens: [], isActive: false },
    { mealName: 'Too Many Calories', allergenStatus: 'verified', allergens: [], calories: 600 },
  ];
  for (const item of fixtures) await Meal.create({ ...base, ...item });
});
afterAll(cleanupTestDatabase);
afterEach(() => jest.restoreAllMocks());

test('aliases, unknown metadata, uncertainty, diet, category, and inactive meals all constrain eligibility', async () => {
  expect(allergyStudent.allergies).toEqual(['milk', 'peanuts', 'tree nuts']);
  const eligible = await Meal.find(buildEligibilityFilter(allergyStudent));
  expect(eligible.map(meal => meal.mealName)).toEqual(['Safe Dal']);
  expect((await Meal.find(buildEligibilityFilter(allergyStudent, { mealType: 'Breakfast' }))).length).toBe(0);
  expect((await Meal.find(buildEligibilityFilter(allergyStudent, { mealType: 'Main Dish' }))).map(meal => meal.mealName)).toEqual(['Safe Dal']);
});

test('unknown status can appear without allergies, but diet selection remains exact', async () => {
  const student = await Student.create({ name: 'No allergy', email: 'noallergy@example.com',
    preferences: { dietaryPreference: 'Non-Vegetarian' } });
  await Meal.create({ ...base, mealName: 'Unknown meat', dietaryPreference: 'Non-Vegetarian' });
  const names = (await Meal.find(buildEligibilityFilter(student))).map(meal => meal.mealName);
  expect(names).toEqual(['Meat Curry', 'Unknown meat']);
});

test('baseline ranking only receives eligible meals and reports unknown exclusions', async () => {
  const token = `Bearer ${jwt.sign({ id: String(allergyUser.id), role: 'student' }, process.env.JWT_SECRET)}`;
  const ml = jest.spyOn(axios, 'post');
  const predicted = await request(app).get('/api/meals/recommend/me').set('Authorization', token);
  expect(predicted.status).toBe(200);
  expect(predicted.body.recommendations.map(meal => meal.mealName)).toEqual(['Safe Dal']);
  expect(predicted.body.excludedUnknownAllergenCount).toBe(2);
  expect(ml).not.toHaveBeenCalled();
});

test('inactive meals are absent from public detail and feedback', async () => {
  const inactive = await Meal.findOne({ mealName: 'Inactive Dal' });
  expect((await request(app).get(`/api/meals/${inactive.id}`)).status).toBe(404);
});

test('curated metadata needs explicit allergens and measured servings, including on updates', async () => {
  const admin = await User.create({ username: 'curator', email: 'curator@example.com',
    password: 'Password123!', role: 'admin' });
  const token = `Bearer ${jwt.sign({ id: String(admin.id), role: 'admin' }, process.env.JWT_SECRET)}`;
  const create = data => request(app).post('/api/meals').set('Authorization', token).send({
    ...base, mealName: 'Curated Dal', ...data,
  });
  expect((await create({ allergenStatus: 'verified', allergens: [] , servingSize: '1 serving' })).status).toBe(400);
  expect((await create({ allergenStatus: 'verified', allergens: ['may contain milk'] })).status).toBe(400);
  expect((await create({ allergenStatus: 'verified' })).status).toBe(400);
  const created = await create({ allergenStatus: 'verified', allergens: ['DAIRY'] });
  expect(created.status).toBe(200);
  expect(created.body.meal.allergens).toEqual(['milk']);
  const id = created.body.meal._id;
  expect((await request(app).put(`/api/meals/${id}`).set('Authorization', token)
    .send({ servingSize: '1 serving' })).status).toBe(400);
  expect((await request(app).put(`/api/meals/${id}`).set('Authorization', token)
    .send({ allergens: ['peanuts'] })).body.meal.allergenStatus).toBe('unknown');
});

test('zero eligible meals stays empty and reports metadata exclusions', async () => {
  const token = `Bearer ${jwt.sign({ id: String(allergyUser.id), role: 'student' }, process.env.JWT_SECRET)}`;
  const response = await request(app).get('/api/meals/recommend/me?mealType=Snack').set('Authorization', token);
  expect(response.status).toBe(200);
  expect(response.body.recommendations).toEqual([]);
  expect(response.body.message).toMatch(/No verified meals/);
  expect(response.body.excludedUnknownAllergenCount).toBe(0);
});
