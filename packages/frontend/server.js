const express = require('express');
var history = require('connect-history-api-fallback');
const serveStatic = require("serve-static")
const path = require('path');
const http = require('http');
const url = require('url');

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:4000';

let app = express();

// Proxy /api/* requests to the backend service
app.use('/api', (req, res) => {
  const target = new url.URL(BACKEND_URL);
  const options = {
    hostname: target.hostname,
    port: target.port || 80,
    path: '/api' + req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.host,
    },
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
