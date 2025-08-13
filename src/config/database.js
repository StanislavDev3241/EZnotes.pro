const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "clearlyai_db",
  user: process.env.DB_USER || "clearlyai_user",
  password: process.env.DB_PASSWORD || "your_secure_password",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on("connect", () => {
  console.log("📊 Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Database connection error:", err);
});

// Initialize database tables
const initDatabase = async () => {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        file_type VARCHAR(100),
        user_id INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'uploaded',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id),
        user_id INTEGER REFERENCES users(id),
        note_type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'generated',
        retention_date DATE DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tasks table for queue management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id),
        user_id INTEGER REFERENCES users(id),
        task_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        priority INTEGER DEFAULT 1,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);

    // Create admin user if not exists
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [process.env.ADMIN_EMAIL || "admin@clearlyai.com"]
    );

    if (adminCheck.rows.length === 0) {
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash(
        process.env.ADMIN_PASSWORD || "admin_secure_password",
        10
      );

      await pool.query(
        `
        INSERT INTO users (email, password_hash, role) 
        VALUES ($1, $2, 'admin')
      `,
        [process.env.ADMIN_EMAIL || "admin@clearlyai.com", hashedPassword]
      );

      console.log("👑 Admin user created successfully");
    }

    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization error:", error);
    throw error;
  }
};

module.exports = { pool, initDatabase };
