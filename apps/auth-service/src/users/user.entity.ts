import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('users')
@Index(['tenantId', 'email'], { unique: true })
export class User extends TenantScopedEntity {
  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId: string | null;

  @Column({ name: 'cognito_sub', nullable: true, unique: true })
  cognitoSub: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column()
  name: string;

  @Column({ name: 'password_hash', nullable: true, select: false })
  passwordHash: string;

  @Column({ name: 'profile_id', type: 'uuid', nullable: true })
  profileId: string;

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_platform_admin', default: false })
  isPlatformAdmin: boolean;

  @Column({ name: 'last_login', type: 'timestamptz', nullable: true })
  lastLogin: Date;

  @Column({ name: 'refresh_token_hash', nullable: true, select: false })
  refreshTokenHash: string;
}
