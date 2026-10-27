const fixture = require('../../contracts/behavioral-v1.json');
const { validatePredictions } = require('../services/recommendations');

test('shared behavioral fixture keeps IDs and probability contract', () => {
  const meals = fixture.meals.map(row => ({ _id: row.meal_id }));
  const response = { success: true, modelVersion: fixture.modelVersion,
    results: fixture.meals.map(row => ({ meal_id: row.meal_id,
      recommended: true, confidence: 0.7 })) };
  expect(validatePredictions(response, meals).get(fixture.meals[0].meal_id).confidence).toBe(0.7);
  expect(() => validatePredictions({ ...response, results: [{ ...response.results[0], confidence: 1.1 }] }, meals))
    .toThrow('Invalid model result');
});
