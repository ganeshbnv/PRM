import { prisma } from '../utils/prisma';
import { Errors } from '../utils/errors';

export async function createSpace(
  userId: string,
  data: {
    name: string;
    key: string;
    description?: string;
    iconEmoji?: string;
    isPrivate?: boolean;
  }
) {
  const existing = await prisma.space.findUnique({ where: { key: data.key } });
  if (existing) throw Errors.conflict(`Space key "${data.key}" is already taken`);

  const space = await prisma.space.create({
    data: {
      ...data,
      creatorId: userId,
      members: { create: { userId, role: 'admin' } },
    },
    include: { _count: { select: { pages: true, members: true } } },
  });
  return space;
}

export async function getSpaces(userId: string) {
  return prisma.space.findMany({
    where: {
      OR: [
        { isPrivate: false },
        { members: { some: { userId } } },
      ],
    },
    include: {
      _count: { select: { pages: true, members: true } },
      creator: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getSpaceByKey(userId: string, key: string) {
  const space = await prisma.space.findUnique({
    where: { key },
    include: {
      _count: { select: { pages: true, members: true } },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
    },
  });
  if (!space) throw Errors.notFound('Space');
  if (space.isPrivate) {
    const isMember = space.members.some((m) => m.userId === userId);
    if (!isMember) throw Errors.forbidden();
  }
  return space;
}

export async function updateSpace(
  userId: string,
  key: string,
  data: Partial<{ name: string; description: string; iconEmoji: string; isPrivate: boolean }>
) {
  const space = await getSpaceByKey(userId, key);
  const member = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId } },
  });
  if (!member || member.role !== 'admin') throw Errors.forbidden();

  return prisma.space.update({ where: { id: space.id }, data });
}

export async function deleteSpace(userId: string, key: string) {
  const space = await getSpaceByKey(userId, key);
  const member = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId } },
  });
  if (!member || member.role !== 'admin') throw Errors.forbidden();
  await prisma.space.delete({ where: { id: space.id } });
}

export async function getSpaceMembers(key: string) {
  const space = await prisma.space.findUnique({ where: { key } });
  if (!space) throw Errors.notFound('Space');
  return prisma.spaceMember.findMany({
    where: { spaceId: space.id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
  });
}

export async function setSpaceMember(requesterId: string, key: string, userId: string, role: 'viewer' | 'admin') {
  const space = await prisma.space.findUnique({ where: { key } });
  if (!space) throw Errors.notFound('Space');
  const requesterMember = await prisma.spaceMember.findUnique({ where: { spaceId_userId: { spaceId: space.id, userId: requesterId } } });
  if (!requesterMember || requesterMember.role !== 'admin') throw Errors.forbidden('Only space admins can manage members');
  return prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId } },
    update: { role },
    create: { spaceId: space.id, userId, role },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
}

export async function removeSpaceMember(requesterId: string, key: string, userId: string) {
  const space = await prisma.space.findUnique({ where: { key } });
  if (!space) throw Errors.notFound('Space');
  // Don't remove the space creator
  if (space.creatorId === userId) throw Errors.forbidden('Cannot remove the space owner');
  const requesterMember = await prisma.spaceMember.findUnique({ where: { spaceId_userId: { spaceId: space.id, userId: requesterId } } });
  if (!requesterMember || requesterMember.role !== 'admin') throw Errors.forbidden('Only space admins can manage members');
  await prisma.spaceMember.deleteMany({ where: { spaceId: space.id, userId } });
}
