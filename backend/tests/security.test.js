process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('base64');

const request = require('supertest');
const { connectTestDatabase, cleanupTestDatabase } = require('./setup');
const app = require('../app');
const User = require('../models/User');
const Student = require('../models/Student');
const jwt = require('jsonwebtoken');

describe('Security API Tests', () => {
  let adminToken;

  beforeAll(async () => {
    await connectTestDatabase();
    await Promise.all([User.init(), Student.init()]);

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
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await cleanupTestDatabase();
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
      .set('Authorization', `Bearer ${adminToken}`)
      .send(injectionPayload);

    expect(response.status).toBe(400);
    const updatedStudent = await Student.findOne({ email: 'test@example.com' });
    expect(updatedStudent.name).not.toBe('Hacked');
  });
});
