import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { logger } from './utils/logger';
import { redis } from './utils/redis';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { spacesRouter } from './routes/spaces';
import { pagesRouter } from './routes/pages';
import { commentsRouter } from './routes/comments';
import { labelsRouter } from './routes/labels';
import { searchRouter } from './routes/search';
import { notificationsRouter } from './routes/notifications';
import { aiRouter } from './routes/ai';
import { attachmentsRouter, UPLOADS_DIR } from './routes/attachments';

const app = express();
const httpServer = createServer(app);

const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

export const io = new Server(httpServer, {
  cors: { origin: clientUrl, credentials: true },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api', pagesRouter);
app.use('/api', commentsRouter);
app.use('/api', labelsRouter);
app.use('/api/search', searchRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/ai', aiRouter);
app.use('/api', attachmentsRouter);
app.use('/api/uploads', express.static(UPLOADS_DIR));

app.use(errorHandler);

// Socket.io: page collaboration rooms
io.on('connection', (socket) => {
  socket.on('join-page', (pageId: string) => {
    void socket.join(`page:${pageId}`);
    socket.to(`page:${pageId}`).emit('user-joined', { socketId: socket.id });
  });

  socket.on('leave-page', (pageId: string) => {
    void socket.leave(`page:${pageId}`);
    socket.to(`page:${pageId}`).emit('user-left', { socketId: socket.id });
  });

  socket.on('page-update', (data: { pageId: string; update: unknown }) => {
    socket.to(`page:${data.pageId}`).emit('page-update', data);
  });

  socket.on('cursor-update', (data: { pageId: string; cursor: unknown; user: unknown }) => {
    socket.to(`page:${data.pageId}`).emit('cursor-update', { ...data, socketId: socket.id });
  });

  socket.on('disconnect', () => {
    // rooms auto-cleaned by socket.io
  });
});

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start() {
  await redis.connect();
  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

function shutdown() {
  logger.info('Shutting down...');
  httpServer.close(() => {
    redis.disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
