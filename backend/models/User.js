const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 64
  },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  password: {
    type: String,
    required: true,
    validate: {
      validator: value => Buffer.byteLength(value, 'utf8') >= 12 && Buffer.byteLength(value, 'utf8') <= 72,
      message: 'Password must be 12 to 72 UTF-8 bytes'
    }
  },
  role: {
    type: String,
    enum: ['admin', 'staff', 'student'],
    default: 'staff'
  }
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
