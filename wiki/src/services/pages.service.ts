import { prisma } from '../utils/prisma';
import { Errors } from '../utils/errors';

const PAGE_SELECT = {
  id: true,
  title: true,
  status: true,
  emoji: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  spaceId: true,
  parentId: true,
  creator: { select: { id: true, name: true, avatarUrl: true } },
  space: { select: { id: true, name: true, key: true } },
  _count: { select: { comments: true, views: true } },
};

export async function createPage(
  userId: string,
  spaceKey: string,
  data: { parentId?: string; title?: string; content?: string }
) {
  const space = await prisma.space.findUnique({ where: { key: spaceKey } });
  if (!space) throw Errors.notFound('Space');

  const page = await prisma.page.create({
    data: {
      title: data.title ?? 'Untitled',
      content: data.content ?? '',
      contentText: '',
      spaceId: space.id,
      creatorId: userId,
      parentId: data.parentId,
    },
    select: { ...PAGE_SELECT, content: true },
  });
  return page;
}

export async function getPageTree(spaceKey: string) {
  const space = await prisma.space.findUnique({ where: { key: spaceKey } });
  if (!space) throw Errors.notFound('Space');

  const pages = await prisma.page.findMany({
    where: { spaceId: space.id, status: { not: 'archived' } },
    select: { id: true, title: true, emoji: true, parentId: true, position: true, status: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return buildTree(pages, null);
}

function buildTree(
  pages: Array<{ id: string; title: string; emoji: string; parentId: string | null; position: number; status: string }>,
  parentId: string | null
): unknown[] {
  return pages
    .filter((p) => p.parentId === parentId)
    .map((p) => ({ ...p, children: buildTree(pages, p.id) }));
}

export async function getPage(pageId: string, userId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { ...PAGE_SELECT, content: true },
  });
  if (!page) throw Errors.notFound('Page');

  // Record view
  await prisma.pageView.upsert({
    where: { id: `${pageId}:${userId}` },
    update: { viewedAt: new Date() },
    create: { id: `${pageId}:${userId}`, pageId, userId },
  }).catch(() => {
    // non-critical
  });

  return page;
}

export async function updatePage(
  userId: string,
  pageId: string,
  data: Partial<{ title: string; content: string; status: string; emoji: string; parentId: string }>
) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw Errors.notFound('Page');

  const latestVersion = await prisma.pageVersion.findFirst({
    where: { pageId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const updateData: Record<string, unknown> = { ...data };
  if (data.status === 'published' && !page.publishedAt) {
    updateData.publishedAt = new Date();
  }
  if (data.content !== undefined) {
    updateData.contentText = data.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    await prisma.pageVersion.create({
      data: {
        version: (latestVersion?.version ?? 0) + 1,
        title: data.title ?? page.title,
        content: data.content,
        pageId,
        authorId: userId,
      },
    });
  }

  return prisma.page.update({
    where: { id: pageId },
    data: updateData,
    select: { ...PAGE_SELECT, content: true },
  });
}

export async function movePage(_userId: string, pageId: string, parentId: string | null, position: number) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw Errors.notFound('Page');
  return prisma.page.update({
    where: { id: pageId },
    data: { parentId, position },
    select: { id: true, parentId: true, position: true, title: true, emoji: true },
  });
}

export async function deletePage(_userId: string, pageId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw Errors.notFound('Page');
  await prisma.page.delete({ where: { id: pageId } });
}

export async function getRecentPages(userId: string, limit = 10) {
  const views = await prisma.pageView.findMany({
    where: { userId },
    orderBy: { viewedAt: 'desc' },
    take: limit,
    select: {
      page: { select: PAGE_SELECT },
      viewedAt: true,
    },
  });
  return views.map((v) => ({ ...v.page, viewedAt: v.viewedAt }));
}

export async function getVersions(pageId: string) {
  return prisma.pageVersion.findMany({
    where: { pageId },
    select: {
      id: true,
      version: true,
      title: true,
      comment: true,
      createdAt: true,
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { version: 'desc' },
  });
}

export async function getVersion(pageId: string, version: number) {
  const v = await prisma.pageVersion.findFirst({
    where: { pageId, version },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  if (!v) throw Errors.notFound('Version');
  return v;
}
