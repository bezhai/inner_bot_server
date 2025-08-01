import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { UserRepository, UserEntity } from '@main-server-v2/core';

@Injectable()
export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(user: UserEntity): Promise<void> {
    const userData = user.toJSON();
    
    await this.prisma.larkUser.upsert({
      where: { unionId: userData.unionId },
      update: {
        name: userData.name,
        avatarOrigin: userData.avatarUrl,
        isAdmin: userData.isAdmin,
        updatedAt: new Date(),
      },
      create: {
        unionId: userData.unionId,
        name: userData.name,
        avatarOrigin: userData.avatarUrl,
        isAdmin: userData.isAdmin,
      },
    });

    // Update open IDs
    const existingOpenIds = await this.prisma.larkUserOpenId.findMany({
      where: { unionId: userData.unionId },
    });

    const existingOpenIdSet = new Set(existingOpenIds.map(o => o.openId));
    const newOpenIdSet = new Set(userData.openIds);

    // Add new open IDs
    const toAdd = userData.openIds.filter(id => !existingOpenIdSet.has(id));
    if (toAdd.length > 0) {
      await this.prisma.larkUserOpenId.createMany({
        data: toAdd.map(openId => ({
          openId,
          unionId: userData.unionId,
        })),
      });
    }

    // Remove old open IDs
    const toRemove = existingOpenIds
      .filter(o => !newOpenIdSet.has(o.openId))
      .map(o => o.openId);
    if (toRemove.length > 0) {
      await this.prisma.larkUserOpenId.deleteMany({
        where: {
          unionId: userData.unionId,
          openId: { in: toRemove },
        },
      });
    }
  }

  async findByUnionId(unionId: string): Promise<UserEntity | null> {
    const user = await this.prisma.larkUser.findUnique({
      where: { unionId },
      include: { openIds: true },
    });

    if (!user) return null;

    return this.toDomainEntity(user);
  }

  async findByOpenId(openId: string): Promise<UserEntity | null> {
    const openIdRecord = await this.prisma.larkUserOpenId.findUnique({
      where: { openId },
      include: { user: { include: { openIds: true } } },
    });

    if (!openIdRecord) return null;

    return this.toDomainEntity(openIdRecord.user);
  }

  async findByIds(unionIds: string[]): Promise<UserEntity[]> {
    const users = await this.prisma.larkUser.findMany({
      where: { unionId: { in: unionIds } },
      include: { openIds: true },
    });

    return users.map(user => this.toDomainEntity(user));
  }

  async batchGetUserNames(unionIds: string[]): Promise<Map<string, string>> {
    const users = await this.prisma.larkUser.findMany({
      where: { unionId: { in: unionIds } },
      select: { unionId: true, name: true },
    });

    return new Map(users.map(u => [u.unionId, u.name]));
  }

  async updateAdminStatus(unionId: string, isAdmin: boolean): Promise<void> {
    await this.prisma.larkUser.update({
      where: { unionId },
      data: { isAdmin },
    });
  }

  async updateUserInfo(
    unionId: string,
    updates: { name?: string; avatarUrl?: string }
  ): Promise<void> {
    await this.prisma.larkUser.update({
      where: { unionId },
      data: {
        name: updates.name,
        avatarOrigin: updates.avatarUrl,
        updatedAt: new Date(),
      },
    });
  }

  async addOpenId(unionId: string, openId: string): Promise<void> {
    await this.prisma.larkUserOpenId.create({
      data: { unionId, openId },
    });
  }

  async removeOpenId(unionId: string, openId: string): Promise<void> {
    await this.prisma.larkUserOpenId.delete({
      where: { openId },
    });
  }

  async findAdmins(): Promise<UserEntity[]> {
    const admins = await this.prisma.larkUser.findMany({
      where: { isAdmin: true },
      include: { openIds: true },
    });

    return admins.map(admin => this.toDomainEntity(admin));
  }

  async search(
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<UserEntity[]> {
    const users = await this.prisma.larkUser.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { unionId: { contains: query } },
        ],
      },
      include: { openIds: true },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    });

    return users.map(user => this.toDomainEntity(user));
  }

  async count(): Promise<number> {
    return this.prisma.larkUser.count();
  }

  async deleteByUnionId(unionId: string): Promise<void> {
    await this.prisma.larkUser.delete({
      where: { unionId },
    });
  }

  private toDomainEntity(dbUser: any): UserEntity {
    return new UserEntity({
      unionId: dbUser.unionId,
      name: dbUser.name,
      avatarUrl: dbUser.avatarOrigin,
      isAdmin: dbUser.isAdmin,
      openIds: dbUser.openIds?.map((o: any) => o.openId) || [],
      createdAt: dbUser.createdAt,
      updatedAt: dbUser.updatedAt,
    });
  }
}