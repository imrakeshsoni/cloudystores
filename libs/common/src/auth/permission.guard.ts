import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<[string, string]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Unauthenticated');

    // Platform admins bypass permission checks
    if (user.isPlatformAdmin) return true;

    const [resource, action] = required;
    const permissions = user.permissions ?? {};

    if (permissions[resource]?.[action] !== true) {
      throw new ForbiddenException(
        `Permission denied: requires ${resource}.${action}`,
      );
    }

    return true;
  }
}
