#!/bin/bash

# ClearlyAI Server Deployment Script
# This script sets up the server on a fresh Ubuntu VPS

set -e

echo "🚀 Starting ClearlyAI Server deployment..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Install Redis
echo "📦 Installing Redis..."
sudo apt install -y redis-server

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Certbot for SSL
echo "📦 Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# Configure PostgreSQL
echo "🔧 Configuring PostgreSQL..."
sudo -u postgres psql -c "CREATE DATABASE clearlyai_db;"
sudo -u postgres psql -c "CREATE USER \"clearlyAI\" WITH PASSWORD 'clearly_postgres';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE clearlyai_db TO \"clearlyAI\";"
sudo -u postgres psql -c "ALTER USER \"clearlyAI\" CREATEDB;"

# Configure Redis
echo "🔧 Configuring Redis..."
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Create application directory
echo "📁 Setting up application directory..."
sudo mkdir -p /var/www/clearlyai-server
sudo chown $USER:$USER /var/www/clearlyai-server

# Copy application files
echo "📋 Copying application files..."
cp -r * /var/www/clearlyai-server/
cd /var/www/clearlyai-server

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install --production

# Create environment file
echo "🔧 Creating environment file..."
cat > .env << EOF
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://eznotespro.netlify.app

DB_HOST=localhost
DB_PORT=5432
DB_NAME=clearlyai_db
DB_USER=clearlyAI
DB_PASSWORD=clearly_postgres

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=clearlyai_super_secret_jwt_key_2024_production
JWT_EXPIRES_IN=24h

MAX_FILE_SIZE=100
UPLOAD_PATH=/var/www/clearlyai-server/uploads
TEMP_PATH=/var/www/clearlyai-server/temp

MAKE_WEBHOOK_URL=https://hook.us2.make.com/xw5ld4jn0by5jn7hg1bups02srki06f8

DEFAULT_RETENTION_DAYS=14

ADMIN_EMAIL=admin@clearlyai.com
ADMIN_PASSWORD=admin_secure_password_2024

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

# Create upload directories
echo "📁 Creating upload directories..."
mkdir -p uploads temp logs
chmod 755 uploads temp logs

# Configure PM2
echo "🔧 Configuring PM2..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'clearlyai-server',
    script: 'src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10
  }]
};
EOF

# Start application with PM2
echo "🚀 Starting application with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Configure Nginx
echo "🔧 Configuring Nginx..."
sudo tee /etc/nginx/sites-available/clearlyai-server > /dev/null << EOF
server {
    listen 80;
    server_name your-domain.com;  # Replace with your actual domain

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Increase client max body size for file uploads
    client_max_body_size 100M;
}
EOF

# Enable site and restart Nginx
echo "🔧 Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/clearlyai-server /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Configure firewall
echo "🔧 Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# Setup SSL certificate (if domain is configured)
echo "🔒 Setting up SSL certificate..."
if [ ! -z "$1" ]; then
    echo "Domain provided: $1"
    sudo sed -i "s/your-domain.com/$1/g" /etc/nginx/sites-available/clearlyai-server
    sudo nginx -t
    sudo systemctl reload nginx
    
    echo "Requesting SSL certificate..."
    sudo certbot --nginx -d $1 --non-interactive --agree-tos --email admin@clearlyai.com
    
    # Auto-renewal
    sudo crontab -l 2>/dev/null | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet"; } | sudo crontab -
else
    echo "⚠️  No domain provided. SSL setup skipped."
    echo "   To setup SSL later, run: sudo certbot --nginx -d your-domain.com"
fi

# Setup log rotation
echo "🔧 Setting up log rotation..."
sudo tee /etc/logrotate.d/clearlyai-server > /dev/null << EOF
/var/www/clearlyai-server/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Setup monitoring
echo "🔧 Setting up basic monitoring..."
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Create systemd service for PM2
echo "🔧 Creating systemd service..."
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update your domain DNS to point to this server"
echo "2. Edit the Nginx configuration with your actual domain"
echo "3. Run: sudo certbot --nginx -d your-domain.com"
echo "4. Test the application: curl http://localhost:3001/health"
echo ""
echo "🔧 Useful commands:"
echo "- View logs: pm2 logs clearlyai-server"
echo "- Restart: pm2 restart clearlyai-server"
echo "- Status: pm2 status"
echo "- Monitor: pm2 monit"
echo ""
echo "🌐 Your server should now be running on port 3001"
echo "📁 Application directory: /var/www/clearlyai-server"
echo "📊 PM2 dashboard: pm2 monit" 