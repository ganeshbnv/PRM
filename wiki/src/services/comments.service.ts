import { prisma } from '../utils/prisma';
import { Errors } from '../utils/errors';

export async function getComments(pageId: string) {
  return prisma.comment.findMany({
    where: { pageId, parentId: null },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      replies: {
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      _count: { select: { replies: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createComment(
  userId: string,
  pageId: string,
  data: { body: string; parentId?: string; anchorText?: string; anchorPos?: unknown }
) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw Errors.notFound('Page');

  return prisma.comment.create({
    data: {
      body: data.body,
      parentId: data.parentId,
      anchorText: data.anchorText,
      anchorPos: data.anchorPos ? JSON.parse(JSON.stringify(data.anchorPos)) : undefined,
      pageId,
      authorId: userId,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function updateComment(userId: string, commentId: string, body: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw Errors.notFound('Comment');
  if (comment.authorId !== userId) throw Errors.forbidden();
  return prisma.comment.update({ where: { id: commentId }, data: { body } });
}

export async function deleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw Errors.notFound('Comment');
  if (comment.authorId !== userId) throw Errors.forbidden();
  await prisma.comment.delete({ where: { id: commentId } });
}

export async function resolveComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw Errors.notFound('Comment');
  return prisma.comment.update({ where: { id: commentId }, data: { isResolved: true } });
}
