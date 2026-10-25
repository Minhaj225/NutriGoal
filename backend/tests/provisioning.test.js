jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  connection: { close: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../models/User', () => ({ findOne: jest.fn() }));

const mongoose = require('mongoose');
const User = require('../models/User');

test('explicit admin rotation saves a new hash and closes the connection', async () => {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/never-used';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'UniqueNewPassphrase42!';
  process.env.ADMIN_ROTATE_PASSWORD = 'true';
  const existing = { role: 'admin', save: jest.fn().mockResolvedValue(undefined) };
  User.findOne.mockResolvedValue(existing);

  const createAdmin = require('../scripts/createAdmin');
  await createAdmin();

  expect(existing.password).toBe('UniqueNewPassphrase42!');
  expect(existing.save).toHaveBeenCalledTimes(1);
  expect(mongoose.connection.close).toHaveBeenCalledTimes(1);
});
