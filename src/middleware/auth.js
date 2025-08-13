const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_super_secret_jwt_key_here"
    );

    // Get user from database
    const userResult = await pool.query(
      "SELECT id, email, role FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(403).json({ error: "Invalid token" });
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ error: "Admin access required" });
  }
};

// Check if user owns the resource or is admin
const requireOwnershipOrAdmin = (resourceUserId) => {
  return (req, res, next) => {
    if (req.user.role === "admin" || req.user.id === resourceUserId) {
      next();
    } else {
      res.status(403).json({ error: "Access denied" });
    }
  };
};

// Optional authentication - allows requests with or without token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    // No token provided, continue without authentication
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_super_secret_jwt_key_here"
    );

    // Get user from database
    const userResult = await pool.query(
      "SELECT id, email, role FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      // Invalid token, continue without authentication
      req.user = null;
      return next();
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    // Token error, continue without authentication
    req.user = null;
    next();
  }
};

// Rate limiting middleware
const rateLimit = require("express-rate-limit");

const createRateLimiter = (windowMs, maxRequests) => {
  return rateLimit({
    windowMs: windowMs || 15 * 60 * 1000, // 15 minutes default
    max: maxRequests || 100, // limit each IP to 100 requests per windowMs
    message: {
      error: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireOwnershipOrAdmin,
  optionalAuth,
  createRateLimiter,
};
