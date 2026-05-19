const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const { authenticateToken, authorizeAdmin } = require("../middleware/auth");

// Create or update student profile
router.post("/", async (req, res) => {
  try {
    const { email } = req.body;
    
    // Validate email
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Sanitize input to prevent NoSQL injection
    const updateData = {};
    const allowedFields = ['name', 'preferences', 'nutritionGoals', 'allergies', 'activityLevel'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const student = await Student.findOneAndUpdate(
      { email }, 
      updateData, 
      { upsert: true, new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: "Student profile updated successfully",
      student
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        error: "Validation error", 
        details: err.message 
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get student profile by email
router.get("/:email", async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.params.email })
      .populate('mealHistory.mealId');
    
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    res.json({
      success: true,
      student
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all students (for admin purposes)
router.get("/", authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Student.countDocuments();
    const students = await Student.find()
      .select('-mealHistory')
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      count: students.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      students
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update student meal feedback
router.post("/:email/feedback", async (req, res) => {
  try {
    const { mealId, liked } = req.body;
    
    if (!mealId || typeof liked !== 'boolean') {
      return res.status(400).json({ 
        error: "mealId and liked (boolean) are required" 
      });
    }

    const student = await Student.findOne({ email: req.params.email });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Add or update meal feedback
    const existingFeedback = student.mealHistory.find(
      history => history.mealId.toString() === mealId
    );

    if (existingFeedback) {
      existingFeedback.liked = liked;
      existingFeedback.consumedAt = new Date();
    } else {
      student.mealHistory.push({
        mealId,
        liked,
        consumedAt: new Date()
      });
    }

    await student.save();
    
    res.json({
      success: true,
      message: "Feedback recorded successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete student profile
router.delete("/:email", authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({ email: req.params.email });
    
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    res.json({
      success: true,
      message: "Student profile deleted successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;