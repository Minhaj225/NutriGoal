const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app'); // Note: we need to export app from app.js
const User = require('../models/User');
const Student = require('../models/Student');
const jwt = require('jsonwebtoken');

describe('Security API Tests', () => {
  let adminToken;

  beforeAll(async () => {
    // Increase timeout for DB connection
    jest.setTimeout(30000);
    
    // Connect to a test database
    const url = process.env.MONGO_URI || 'mongodb://localhost:27017/nutrigoal_test';
    try {
      await mongoose.connect(url);
    } catch (err) {
      console.error('Test DB Connection Error:', err);
      throw err;
    }

    // Create an admin user
    const admin = new User({
      username: 'testadmin',
      password: 'Password123!',
      role: 'admin'
    });
    await admin.save();

    // Generate token
    adminToken = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET || 'default_secret_change_me',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Student.deleteMany({});
    await mongoose.connection.close();
  });

  test('P0: Should block unauthorized access to admin routes', async () => {
    const response = await request(app).get('/api/students');
    expect(response.status).toBe(401);
  });

  test('P0: Should allow authorized admin access to admin routes', async () => {
    const response = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
  });

  test('P0: Should prevent NoSQL injection in student updates', async () => {
    // Create a student first
    const student = await Student.create({ email: 'test@example.com', name: 'Test User' });
    
    const injectionPayload = {
      email: 'test@example.com',
      $set: { name: 'Hacked' } // This should be ignored by our allow-list
    };

    const response = await request(app)
      .post('/api/students')
      .send(injectionPayload);

    expect(response.status).toBe(200);
    const updatedStudent = await Student.findOne({ email: 'test@example.com' });
    expect(updatedStudent.name).not.toBe('Hacked');
  });
});
