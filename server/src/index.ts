import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import router from './routes/index';
import authRouter from './routes/auth';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, router);

// 404 fallthrough
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PRM server running on http://localhost:${PORT}`);
  console.log(`ADO org: ${process.env.ADO_ORG} / project: ${process.env.ADO_PROJECT}`);
});
