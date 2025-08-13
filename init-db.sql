-- ClearlyAI Database Initialization Script

-- Create tables
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

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
);

-- Create admin user
INSERT INTO users (email, password_hash, role) 
VALUES ('admin@clearlyai.com', '$2a$10$rQZ9K8mN2pL1vX3yB6cE7dF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ4a5b6c7d8e9f0g1h2i3j4k5l6m7n8o9p0q1r2s3t4u5v6w7x8y9z0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z', 'admin')
ON CONFLICT (email) DO NOTHING; 