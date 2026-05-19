const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const username = process.env.ADMIN_USERNAME ;
    const password = process.env.ADMIN_PASSWORD ;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log(`❌ User ${username} already exists.`);
      process.exit(0);
    }

    const admin = new User({
      username,
      password,
      role: 'admin'
    });

    await admin.save();
    console.log(`✅ Admin user created successfully!\nUsername: ${username}\nPassword: ${password}`);
  } catch (err) {
    console.error('❌ Error creating admin:', err);
  } finally {
    await mongoose.connection.close();
  }
}

createAdmin();
