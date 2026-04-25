import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  private async withTenant<T>(tenantId: string, fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
      return fn(manager);
    });
  }

  async findByEmailAndTenant(email: string, tenantId: string): Promise<User | null> {
    return this.withTenant(tenantId, async (manager) => {
      const results = await manager
        .createQueryBuilder(User, 'u')
        .addSelect('u.passwordHash')
        .where('u.email = :email AND u.tenantId = :tenantId AND u.isActive = true', { email, tenantId })
        .getMany();
      return results[0] ?? null;
    });
  }

  async findById(id: string, tenantId: string): Promise<User> {
    return this.withTenant(tenantId, async (manager) => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException('User not found');
      return user;
    });
  }

  async findWithPermissions(userId: string, tenantId: string): Promise<User & { permissions: any }> {
    return this.withTenant(tenantId, async (manager) => {
      const result = await manager.query(
        `SELECT u.*, p.permissions FROM users u LEFT JOIN profiles p ON p.id = u.profile_id WHERE u.id = $1 AND u.is_active = true`,
        [userId],
      );
      if (!result[0]) throw new NotFoundException('User not found');
      return result[0];
    });
  }

  async updateLastLogin(id: string, tenantId: string): Promise<void> {
    await this.withTenant(tenantId, (manager) =>
      manager.update(User, id, { lastLogin: new Date() }),
    );
  }

  async updateRefreshToken(id: string, token: string | null, tenantId: string): Promise<void> {
    const hash = token ? await bcrypt.hash(token, 10) : null;
    await this.withTenant(tenantId, (manager) =>
      manager
        .createQueryBuilder()
        .update(User)
        .set({ refreshTokenHash: hash } as any)
        .where('id = :id', { id })
        .execute(),
    );
  }

  async validateRefreshToken(id: string, token: string, tenantId: string): Promise<boolean> {
    const user = await this.withTenant(tenantId, (manager) =>
      manager
        .createQueryBuilder(User, 'u')
        .addSelect('u.refreshTokenHash')
        .where('u.id = :id', { id })
        .getOne(),
    );
    if (!user?.refreshTokenHash) return false;
    return bcrypt.compare(token, user.refreshTokenHash);
  }
}
