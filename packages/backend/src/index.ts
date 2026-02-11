import express from 'express';
import cors from 'cors';
import { healthRouter } from './api/routes/health.js';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// CORS
const corsOrigin = process.env.MIDDLEWARE_CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));

// JSON body parser
app.use(express.json());

// API key middleware
const apiKey = process.env.MIDDLEWARE_API_KEY;
if (apiKey) {
  app.use('/api', (req, res, next) => {
    if (req.headers['x-api-key'] !== apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });
}

// Routes
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

app.listen(PORT, () => {
  console.log(`Indexer Tools v4 backend running on port ${PORT}`);
});
