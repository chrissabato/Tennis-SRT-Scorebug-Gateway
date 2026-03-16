const https = require('https');
const http = require('http');
const { URL } = require('url');

class Notifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl || '';
    this.enabled = false;
  }

  setEnabled(val) {
    this.enabled = !!val;
  }

  isConfigured() {
    return !!this.webhookUrl;
  }

  send(text) {
    if (!this.enabled || !this.webhookUrl) return;
    try {
      const url = new URL(this.webhookUrl);
      const body = JSON.stringify({ text });
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req = (url.protocol === 'https:' ? https : http).request(options);
      req.on('error', () => {});
      req.write(body);
      req.end();
    } catch (_) {}
  }
}

module.exports = Notifier;
