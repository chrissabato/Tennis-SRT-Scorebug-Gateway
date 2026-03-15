#!/bin/bash
set -e

REPO="https://github.com/chrissabato/Tennis-SRT-Scorebug-Gateway.git"
APP_DIR="/root/Tennis-SRT-Scorebug-Gateway"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

echo "=== Tennis SRT Scorebug Gateway — Deploy ==="

# Load config from /etc/tennis-env if present (parse manually to handle special chars in values)
if [ -f /etc/tennis-env ]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    value="${value#\"}" ; value="${value%\"}"
    value="${value#\'}" ; value="${value%\'}"
    export "$key=$value"
  done < /etc/tennis-env
fi
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

# System packages
echo "--- Installing system dependencies..."
apt-get update -qq
apt-get install -y ffmpeg ufw curl libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Node.js 18+ via NodeSource
echo "--- Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Node global tools
echo "--- Installing PM2..."
npm install -g pm2 --silent

# Clone or update repo
if [ -d "$APP_DIR" ]; then
  echo "--- Updating existing repo..."
  git -C "$APP_DIR" pull
else
  echo "--- Cloning repo..."
  git clone "$REPO" "$APP_DIR"
fi

# App dependencies
echo "--- Installing npm dependencies..."
cd "$APP_DIR"
npm install --silent

# Firewall
echo "--- Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5000:5010/udp
ufw allow 6000:6010/udp
ufw --force enable

# Nginx / TLS
CERT=/etc/ssl/tennis.crt
KEY=/etc/ssl/tennis.key

# Basic auth
HTPASSWD_FILE=/etc/nginx/.htpasswd
if [ -n "$BASIC_AUTH_USER" ] && [ -n "$BASIC_AUTH_PASS" ]; then
  apt-get install -y apache2-utils
  htpasswd -cb "$HTPASSWD_FILE" "$BASIC_AUTH_USER" "$BASIC_AUTH_PASS"
  AUTH_BLOCK="auth_basic \"Tennis Gateway\"; auth_basic_user_file $HTPASSWD_FILE;"
  echo "--- Basic auth configured for user: $BASIC_AUTH_USER"
else
  AUTH_BLOCK=""
  echo "--- No basic auth configured (BASIC_AUTH_USER/BASIC_AUTH_PASS not set)"
fi

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
  echo "--- Configuring nginx with provided TLS cert..."
  apt-get install -y nginx
  rm -f /etc/nginx/sites-enabled/default
  cat > /etc/nginx/sites-available/tennis << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate     $CERT;
    ssl_certificate_key $KEY;
    $AUTH_BLOCK
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/tennis /etc/nginx/sites-enabled/tennis
  nginx -t && systemctl restart nginx
  echo "--- nginx configured with TLS"
elif [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  echo "--- No cert found, obtaining Let's Encrypt certificate for $DOMAIN..."
  apt-get install -y nginx certbot python3-certbot-nginx
  rm -f /etc/nginx/sites-enabled/default
  cat > /etc/nginx/sites-available/tennis << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    $AUTH_BLOCK
    location / { proxy_pass http://127.0.0.1:3000; }
}
NGINX
  ln -sf /etc/nginx/sites-available/tennis /etc/nginx/sites-enabled/tennis
  nginx -t && systemctl restart nginx
  certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --domains "$DOMAIN" --redirect
  echo "--- nginx configured with Let's Encrypt TLS"
else
  echo "--- No cert or domain configured — app accessible directly on port 3000"
  ufw allow 3000/tcp
fi

# Start app
echo "--- Starting app with PM2..."
cd "$APP_DIR"
pm2 delete tennis-gateway 2>/dev/null || true
pm2 start ecosystem.config.js

IP=$(curl -s https://api.ipify.org)
echo ""
echo "=== Done! ==="
if [ -f /etc/ssl/tennis.crt ] || ([ -n "$DOMAIN" ] && [ -n "$EMAIL" ]); then
  echo "    App:  https://$DOMAIN"
else
  echo "    App:  http://$IP:3000"
fi
echo "    Logs: pm2 logs tennis-gateway"

# Notify via Google Chat webhook if configured
if [ -n "$DEPLOY_WEBHOOK_URL" ]; then
  curl -s -X POST -H 'Content-Type: application/json' \
    -d "{\"text\": \"Tennis gateway deploy complete on $DOMAIN\"}" \
    "$DEPLOY_WEBHOOK_URL" > /dev/null
fi
