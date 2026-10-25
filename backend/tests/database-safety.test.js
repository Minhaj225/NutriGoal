jest.mock('mongoose', () => ({
  connect: jest.fn(),
  connection: {
    db: { databaseName: null },
    dropDatabase: jest.fn(),
    close: jest.fn(),
  },
}));

const mongoose = require('mongoose');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'test';
  delete process.env.TEST_MONGO_URI;
  mongoose.connection.db.databaseName = null;
});

test('rejects_application_uri', async () => {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/nutrigoal';
  process.env.TEST_MONGO_URI = process.env.MONGO_URI;
  await expect(connectTestDatabase()).rejects.toThrow(/test database/i);
  expect(mongoose.connect).not.toHaveBeenCalled();
  await cleanupTestDatabase();
  expect(mongoose.connection.dropDatabase).not.toHaveBeenCalled();
});

test('rejects_non_test_database_name', async () => {
  process.env.TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/production';
  await expect(connectTestDatabase()).rejects.toThrow(/test database/i);
  expect(mongoose.connect).not.toHaveBeenCalled();
  expect(mongoose.connection.dropDatabase).not.toHaveBeenCalled();
});

test('rejects_non_loopback_host_and_missing_uri', async () => {
  await expect(connectTestDatabase()).rejects.toThrow('TEST_MONGO_URI');
  process.env.TEST_MONGO_URI = 'mongodb://db.example.com:27017/nutrigoal_test';
  await expect(connectTestDatabase()).rejects.toThrow(/loopback/i);
  expect(mongoose.connect).not.toHaveBeenCalled();
});

test('does_not_cleanup_after_failed_connect', async () => {
  process.env.TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/nutrigoal_test';
  mongoose.connect.mockRejectedValueOnce(new Error('offline'));
  await expect(connectTestDatabase()).rejects.toThrow('offline');
  await cleanupTestDatabase();
  expect(mongoose.connection.dropDatabase).not.toHaveBeenCalled();
});

test('cleans_only_owned_test_database', async () => {
  process.env.TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/nutrigoal_test';
  mongoose.connect.mockImplementationOnce(async (uri) => {
    mongoose.connection.db.databaseName = new URL(uri).pathname.slice(1);
  });
  const name = await connectTestDatabase();
  expect(name).toMatch(/^nutrigoal_test_[a-f0-9]+$/);
  expect(mongoose.connect).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ directConnection: true }));
  expect(mongoose.connection.db.databaseName).toBe(name);
  await cleanupTestDatabase();
  expect(mongoose.connection.dropDatabase).toHaveBeenCalledTimes(1);
  expect(mongoose.connection.close).toHaveBeenCalledTimes(1);
});

test('refuses_cleanup_if_connection_changed', async () => {
  process.env.TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/nutrigoal_test';
  mongoose.connect.mockImplementationOnce(async (uri) => {
    mongoose.connection.db.databaseName = new URL(uri).pathname.slice(1);
  });
  await connectTestDatabase();
  mongoose.connection.db.databaseName = 'production';
  await expect(cleanupTestDatabase()).rejects.toThrow(/refusing to clean/i);
  expect(mongoose.connection.dropDatabase).not.toHaveBeenCalled();
  expect(mongoose.connection.close).toHaveBeenCalledTimes(1);
});
