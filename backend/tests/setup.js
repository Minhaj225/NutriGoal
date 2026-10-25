const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');

let ownedDatabase;

async function connectTestDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Database tests require NODE_ENV=test');
  }

  if (!process.env.TEST_MONGO_URI) {
    throw new Error('Database tests require TEST_MONGO_URI');
  }

  let uri;
  try {
    uri = new URL(process.env.TEST_MONGO_URI);
  } catch {
    throw new Error('TEST_MONGO_URI must be a local MongoDB test database URI');
  }

  if (uri.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname) ||
      uri.pathname !== '/nutrigoal_test' ||
      [...uri.searchParams.keys()].some(key => !['replicaSet', 'directConnection'].includes(key))) {
    throw new Error('TEST_MONGO_URI must target a loopback nutrigoal_test database');
  }

  const name = `nutrigoal_test_${randomBytes(8).toString('hex')}`;
  uri.pathname = `/${name}`;
  await mongoose.connect(uri.toString(), {
    directConnection: true,
    serverSelectionTimeoutMS: 5000,
  });
  if (mongoose.connection.db?.databaseName !== name) {
    await mongoose.connection.close();
    throw new Error('MongoDB connected to an unexpected database');
  }
  ownedDatabase = name;
  return name;
}

async function cleanupTestDatabase() {
  if (!ownedDatabase) return;
  const name = ownedDatabase;
  ownedDatabase = undefined;
  try {
    if (mongoose.connection.db?.databaseName !== name) {
      throw new Error('Refusing to clean a database this test did not create');
    }
    await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.connection.close();
  }
}

module.exports = { connectTestDatabase, cleanupTestDatabase };
