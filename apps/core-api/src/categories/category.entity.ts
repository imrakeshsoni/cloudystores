import { Entity, Column, Index } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('categories')
export class Category extends TenantScopedEntity {
  @Column()
  name: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ default: 0 })
  level: number;

  @Column({ nullable: true })
  icon: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
