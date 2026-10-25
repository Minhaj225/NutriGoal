const express = require('express');
const Student = require('../models/Student');
const MealFeedback = require('../models/MealFeedback');
const { recordMealFeedback, deleteStudentProfile } = require('../services/feedback');
const { authenticateToken, authorizeAdmin, requireStudent } = require('../middleware/auth');
const { email, emailPattern, id, integer, invalid, keys, profile, query } = require('../validation');

const router = express.Router();
router.use(authenticateToken);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

function requestedEmail(req, supplied = req.params.email) {
  const target = email(supplied);
  if (req.user.role !== 'admin' && (req.user.role !== 'student' || req.user.email !== target)) {
    const error = new Error('Profile belongs to another account');
    error.status = 403;
    throw error;
  }
  return target;
}

async function findProfile(req, target) {
  return req.user.role === 'student'
    ? Student.findOne({ userId: req.user.id })
    : Student.findOne({ email: emailPattern(target) });
}

async function saveProfile(req, res, next, target) {
  try {
    profile(req.body, target, false);
    const student = await findProfile(req, target);
    const changes = profile(req.body, target, !student);
    const record = student || new Student({ email: target, ...(req.user.role === 'student' ? { userId: req.user.id } : {}) });
    for (const [path, value] of Object.entries(changes)) record.set(path, value);
    await record.save();
    res.json({ success: true, message: 'Student profile updated successfully', student: record });
  } catch (err) { next(err); }
}

async function getProfile(req, res, next, target) {
  try {
    const student = await findProfile(req, target);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ success: true, student });
  } catch (err) { next(err); }
}

async function recordFeedback(req, res, next, target) {
  try {
    keys(req.body, ['mealId', 'liked']);
    const mealId = id(req.body.mealId);
    if (typeof req.body.liked !== 'boolean') invalid('liked must be a boolean');
    const student = await findProfile(req, target);
    if (!student?.userId) return res.status(404).json({ error: 'Owned student profile not found' });
    const result = await recordMealFeedback({ studentId: student.userId, mealId, liked: req.body.liked });
    res.json({ success: true, message: 'Feedback recorded successfully', ...result });
  } catch (err) { next(err); }
}

router.get('/me', requireStudent, (req, res, next) => getProfile(req, res, next, req.user.email));
router.post('/me', requireStudent, (req, res, next) => saveProfile(req, res, next, req.user.email));
router.post('/me/feedback', requireStudent, (req, res, next) => recordFeedback(req, res, next, req.user.email));
router.get('/me/feedback', requireStudent, async (req, res, next) => {
  try {
    const options = query(req, {
      page: value => integer(value, 1, 1000000),
      limit: value => integer(value, 1, 100),
    });
    const page = options.page || 1;
    const limit = options.limit || 20;
    const feedback = await MealFeedback.find({ studentId: req.user.id })
      .sort({ feedbackAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean();
    res.json({ success: true, page, feedback });
  } catch (err) { next(err); }
});
router.delete('/me', requireStudent, async (req, res, next) => {
  try {
    await deleteStudentProfile(req.user.id);
    res.json({ success: true, message: 'Student profile deleted successfully' });
  } catch (err) { next(err); }
});

router.get('/', authorizeAdmin, async (req, res, next) => {
  try {
    const options = query(req, {
      page: value => integer(value, 1, 1000000),
      limit: value => integer(value, 1, 100),
    });
    const page = options.page || 1;
    const limit = options.limit || 10;
    const total = await Student.countDocuments();
    const students = await Student.find().select('-mealHistory').sort({ _id: 1 }).skip((page - 1) * limit).limit(limit);
    res.json({ success: true, count: students.length, total, totalPages: Math.ceil(total / limit), currentPage: page, students });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    keys(req.body, ['name', 'email', 'preferences', 'nutritionGoals', 'allergies', 'activityLevel']);
    const target = requestedEmail(req, req.body.email);
    return saveProfile(req, res, next, target);
  } catch (err) { next(err); }
});

router.get('/:email', (req, res, next) => {
  try { return getProfile(req, res, next, requestedEmail(req)); } catch (err) { next(err); }
});
router.post('/:email/feedback', (req, res, next) => {
  try { return recordFeedback(req, res, next, requestedEmail(req)); } catch (err) { next(err); }
});
router.delete('/:email', authorizeAdmin, async (req, res, next) => {
  try {
    const target = requestedEmail(req);
    const student = await Student.findOne({ email: emailPattern(target) });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.userId) await deleteStudentProfile(student.userId);
    else await Student.deleteOne({ _id: student._id });
    res.json({ success: true, message: 'Student profile deleted successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
