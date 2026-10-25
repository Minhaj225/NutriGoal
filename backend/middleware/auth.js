const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret } = require('../config');

const authenticateToken = async (req, res, next) => {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.get('authorization') || '');
  if (!match) {
    return res.status(401).json({ error: 'Access token required' });
  }

  let claims;
  try {
    claims = jwt.verify(match[1], jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (!/^[a-f0-9]{24}$/.test(claims.id) || typeof claims.role !== 'string') {
    return res.status(401).json({ error: 'Invalid token claims' });
  }

  try {
    const user = await User.findById(claims.id).select('username email role');
    if (!user || user.role !== claims.role) {
      return res.status(401).json({ error: 'Session no longer valid' });
    }
    req.user = { id: String(user._id), username: user.username, role: user.role };
    if (user.role === 'student') req.user.email = user.email;
    next();
  } catch (err) {
    next(err);
  }
};

const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrative privileges required' });
  }
  next();
};

const requireStudent = (req, res, next) => {
  if (req.user?.role !== 'student' || !req.user.email) {
    return res.status(403).json({ error: 'Student account required' });
  }
  next();
};

module.exports = { authenticateToken, authorizeAdmin, requireStudent };
