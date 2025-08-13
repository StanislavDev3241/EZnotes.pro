# ClearlyAI Server

A robust Node.js backend server for the ClearlyAI application, providing file handling, queue management, and role-based access control.

## 🚀 Features

- **File Upload & Management**: Secure file upload with size limits and type validation
- **Task Queue System**: Redis-based queue management using Bull.js
- **User Authentication**: JWT-based authentication with bcrypt password hashing
- **Role-Based Access Control**: Admin and regular user roles with different permissions
- **Make.com Integration**: Webhook integration for AI processing
- **Database Management**: PostgreSQL with automatic cleanup and retention policies
- **Docker Support**: Containerized deployment with Docker Compose

## 🏗️ Architecture

- **Framework**: Express.js
- **Database**: PostgreSQL
- **Cache/Queue**: Redis + Bull.js
- **Authentication**: JWT + bcrypt
- **File Handling**: Multer
- **Security**: Helmet, CORS, Rate Limiting

## 📋 Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

## 🚀 Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/StanislavDev3241/EZnotes.pro.git
   cd EZnotes.pro/clearlyai-server
   ```

2. **Start the services**
   ```bash
   docker-compose up -d
   ```

3. **Initialize the database**
   ```bash
   docker exec -it clearlyai-postgres psql -U clearlyai_user -d clearlyai_db -f /docker-entrypoint-initdb.d/init-db.sql
   ```

4. **Access the server**
   - Server: http://localhost:3001
   - Health Check: http://localhost:3001/health

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start the server**
   ```bash
   npm run dev
   ```

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `env.example`:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clearlyai_db
DB_USER=clearlyai_user
DB_PASSWORD=clearlyai_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret_here

# File Upload
MAX_FILE_SIZE=100
UPLOAD_PATH=./uploads
TEMP_PATH=./temp

# Make.com Integration
MAKE_WEBHOOK_URL=https://hook.us2.make.com/your_webhook_url
MAKE_API_KEY=your_api_key_here

# User Management
DEFAULT_RETENTION_DAYS=14
ADMIN_EMAIL=admin@clearlyai.com
ADMIN_PASSWORD=admin_secure_password_2024

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 👥 User Management

### Default Users

**Admin User:**
- Email: `admin@clearlyai.com`
- Password: `admin_secure_password_2024`
- Role: `admin`

**Regular User:**
- Email: `user@clearlyai.com`
- Password: `admin_secure_password_2024`
- Role: `user`

### Role Permissions

- **Admin**: Access to all notes, admin dashboard, user management
- **Regular User**: Upload files, view own notes only

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### File Management
- `POST /api/upload` - Upload audio files
- `GET /api/files/:id` - Get file information
- `DELETE /api/files/:id` - Delete file

### Notes
- `GET /api/notes/user/:id` - Get user's notes
- `POST /api/notes/webhook` - Make.com webhook endpoint

### Admin (Admin only)
- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/notes` - All notes
- `GET /api/admin/queue/status` - Queue status
- `GET /api/admin/files` - All files

## 🐳 Docker Services

- **clearlyai-server**: Node.js application server
- **clearlyai-postgres**: PostgreSQL database
- **clearlyai-redis**: Redis cache and queue

## 🔒 Security Features

- JWT authentication
- bcrypt password hashing
- CORS protection
- Rate limiting
- Helmet security headers
- Input validation
- File type and size restrictions

## 📊 Monitoring

- Health check endpoint: `/health`
- Request logging with Morgan
- Error handling and logging
- Queue monitoring

## 🧪 Testing

Test the server endpoints:

```bash
# Health check
curl http://localhost:3001/health

# Admin login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clearlyai.com","password":"admin_secure_password_2024"}'
```

## 📝 License

This project is part of the ClearlyAI application suite.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For support and questions, please contact the development team.
