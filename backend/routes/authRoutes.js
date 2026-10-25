const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Student = require('../models/Student');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');
const { authenticateToken } = require('../middleware/auth');
const { email, emailPattern, keys, invalid } = require('../validation');

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || username.trim().length > 64 ||
        typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Invalid username or password format' });
    }

    const identity = username.trim();
    const user = await User.findOne({ username: identity.includes('@') ? identity.toLowerCase() : identity });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: String(user._id), role: user.role },
      jwtSecret,
      { algorithm: 'HS256', expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      role: user.role,
      username: user.username,
      ...(user.role === 'student' ? { email: user.email } : {})
    });
  } catch (err) {
    next(err);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    keys(req.body, ['email', 'password']);
    const canonical = email(req.body.email);
    const password = req.body.password;
    if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 12 ||
        Buffer.byteLength(password, 'utf8') > 72) invalid('Password must be 12 to 72 UTF-8 bytes');
    // An email alone is not evidence that this account owns a legacy profile.
    if (await Student.findOne({ email: emailPattern(canonical) })) {
      return res.status(409).json({ error: 'profile_claim_required' });
    }
    if (await User.exists({ $or: [{ email: canonical }, { username: canonical }] })) {
      return res.status(409).json({ error: 'Account already exists' });
    }
    const user = await User.create({ username: canonical, email: canonical, password, role: 'student' });
    const token = jwt.sign({ id: String(user._id), role: 'student' }, jwtSecret,
      { algorithm: 'HS256', expiresIn: '24h' });
    res.status(201).json({ success: true, token, id: String(user._id), role: 'student', username: user.username, email: canonical });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

module.exports = router;
