import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { Errors } from '../utils/errors';

export const UPLOADS_DIR = path.join(__dirname, '../../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export const attachmentsRouter = Router();

attachmentsRouter.use(authenticate);

// GET /api/pages/:id/attachments
attachmentsRouter.get(
  '/pages/:id/attachments',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const items = await prisma.attachment.findMany({
        where: { pageId: req.params.id },
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json(items);
    } catch (err) { next(err); }
  }
);

// POST /api/pages/:id/attachments
attachmentsRouter.post(
  '/pages/:id/attachments',
  upload.single('file'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
      const att = await prisma.attachment.create({
        data: {
          filename: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          pageId: req.params.id,
          uploaderId: req.user!.id,
        },
        include: { uploader: { select: { id: true, name: true } } },
      });
      res.status(201).json(att);
    } catch (err) { next(err); }
  }
);

// DELETE /api/attachments/:id
attachmentsRouter.delete(
  '/attachments/:id',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
      if (!att) throw Errors.notFound('Attachment');
      try { fs.unlinkSync(path.join(UPLOADS_DIR, att.storedName)); } catch { /* already gone */ }
      await prisma.attachment.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);
