import { prisma } from '../utils/prisma';
import { Errors } from '../utils/errors';

export async function getLabels(spaceKey: string) {
  const space = await prisma.space.findUnique({ where: { key: spaceKey } });
  if (!space) throw Errors.notFound('Space');
  return prisma.label.findMany({ where: { spaceId: space.id }, orderBy: { name: 'asc' } });
}

export async function createLabel(userId: string, spaceKey: string, data: { name: string; color?: string }) {
  const space = await prisma.space.findUnique({ where: { key: spaceKey } });
  if (!space) throw Errors.notFound('Space');

  const existing = await prisma.label.findUnique({ where: { name_spaceId: { name: data.name, spaceId: space.id } } });
  if (existing) throw Errors.conflict('Label already exists');

  return prisma.label.create({ data: { name: data.name, color: data.color ?? '#6b7280', spaceId: space.id, creatorId: userId } });
}

export async function addLabelToPage(pageId: string, labelId: string) {
  return prisma.pageLabel.upsert({
    where: { pageId_labelId: { pageId, labelId } },
    update: {},
    create: { pageId, labelId },
  });
}

export async function removeLabelFromPage(pageId: string, labelId: string) {
  await prisma.pageLabel.delete({ where: { pageId_labelId: { pageId, labelId } } });
}
