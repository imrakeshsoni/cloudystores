import { Entity, Column, Unique } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('custom_field_definitions')
@Unique(['tenantId', 'objectType', 'fieldName'])
export class CustomFieldDefinition extends TenantScopedEntity {
  @Column({ name: 'object_type' })
  objectType: string; // product | customer | order | supplier

  @Column({ name: 'field_name' })
  fieldName: string; // internal snake_case name

  @Column({ name: 'field_label' })
  fieldLabel: string; // display label

  @Column({ name: 'field_type' })
  fieldType: string; // text | number | date | boolean | picklist | lookup

  @Column({ name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ type: 'jsonb', nullable: true })
  options: string[] | null; // for picklist type

  @Column({ name: 'default_value', nullable: true })
  defaultValue: string;

  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
