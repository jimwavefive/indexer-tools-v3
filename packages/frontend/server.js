const express = require('express');
var history = require('connect-history-api-fallback');
const serveStatic = require("serve-static")
const path = require('path');
const http = require('http');
const url = require('url');

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:4000';
const MIDDLEWARE_API_KEY = process.env.MIDDLEWARE_API_KEY;

let app = express();

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CSP: connect-src allows all HTTPS because the app connects to user-configured
  // endpoints (RPC providers, Graph gateways, indexer status endpoints) on arbitrary domains.
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com");
  next();
});

// Proxy /api/* requests to the backend service
app.use('/api', (req, res) => {
  const target = new url.URL(BACKEND_URL);
  const proxyHeaders = { ...req.headers, host: target.host };
  // Forward API key to backend if configured
  if (MIDDLEWARE_API_KEY) {
    proxyHeaders['x-api-key'] = MIDDLEWARE_API_KEY;
  }
  const options = {
    hostname: target.hostname,
    port: target.port || 80,
    path: '/api' + req.url,
    method: req.method,
    headers: proxyHeaders,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] Error forwarding to backend:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    }
  });

  req.pipe(proxyReq, { end: true });
});

app.use(history());
app.use(serveStatic(path.join(__dirname, 'dist')));
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Indexer Tools v3 is running on port ${port}`);
  console.log(`API proxy target: ${BACKEND_URL}`);
});
