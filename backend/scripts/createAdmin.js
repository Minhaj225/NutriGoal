const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createAdmin() {
  let connected = false;
  try {
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    const passwordBytes = typeof password === 'string' ? Buffer.byteLength(password, 'utf8') : 0;
    if (!username || username.length > 64) throw new Error('ADMIN_USERNAME must be 1 to 64 characters');
    if (passwordBytes < 12 || passwordBytes > 72 || /^(admin123|password123|your.*password|change.?me)$/i.test(password)) {
      throw new Error('ADMIN_PASSWORD must be a non-example password of 12 to 72 UTF-8 bytes');
    }
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');

    await mongoose.connect(process.env.MONGO_URI);
    connected = true;
    console.log('Connected to MongoDB');

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      if (existingUser.role !== 'admin') throw new Error('Existing username is not an administrator');
      if (process.env.ADMIN_ROTATE_PASSWORD === 'true') {
        existingUser.password = password;
        await existingUser.save();
        console.log('Admin password rotated successfully');
        return;
      }
      console.log(`User ${username} already exists.`);
      return;
    }

    const admin = new User({
      username,
      password,
      role: 'admin'
    });

    await admin.save();
    console.log('Admin user created successfully!');
  } catch (err) {
    console.error('Error creating admin:', err.message);
    process.exitCode = 1;
  } finally {
    if (connected) {
      try {
        await mongoose.connection.close();
      } catch (err) {
        console.error('Error closing MongoDB:', err.message);
        process.exitCode = 1;
      }
    }
  }
}

if (require.main === module) createAdmin();

module.exports = createAdmin;
