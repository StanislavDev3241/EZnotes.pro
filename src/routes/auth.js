const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { pool } = require("../config/database");
const { createRateLimiter } = require("../middleware/auth");

const router = express.Router();

// Rate limiting for auth endpoints
const authRateLimiter = createRateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes

// Validation middleware
const validateLogin = [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
];

// Login endpoint
router.post("/login", authRateLimiter, validateLogin, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation error",
        details: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const userResult = await pool.query(
      "SELECT id, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || "your_super_secret_jwt_key_here",
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );

    // Update last login
    await pool.query(
      "UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [user.id]
    );

    // Return user info and token
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Verify token endpoint
router.get("/verify", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_super_secret_jwt_key_here"
    );

    // Get updated user info
    const userResult = await pool.query(
      "SELECT id, email, role, created_at FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid token" });
    }

    res.json({
      valid: true,
      user: userResult.rows[0],
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    res.status(401).json({ error: "Invalid token" });
  }
});

// Change password endpoint (admin only)
router.post("/change-password", validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    const result = await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id",
      [hashedPassword, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Logout endpoint (client-side token removal)
router.post("/logout", (req, res) => {
  res.json({ message: "Logout successful" });
});

module.exports = router;
