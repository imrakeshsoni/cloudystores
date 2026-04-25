import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';

export const PERMISSION_KEY = 'required_permission';

export type ResourceAction = [resource: string, action: string];

export const RequirePermission = (resource: string, action: string) =>
  applyDecorators(
    SetMetadata(PERMISSION_KEY, [resource, action]),
    UseGuards(PermissionGuard),
  );

export const Public = () => SetMetadata('is_public', true);
