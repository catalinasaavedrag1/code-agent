import express from 'express';
import cors from 'cors';
import routes from './api/routes.js';
import { env } from './config/env.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(routes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  res.status(500).json({ message });
});

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});