import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

export interface AuthenticatedRequest extends Request {
  tenantId: string;
  shopId?: string;
  user: {
    sub: string;
    email: string;
    tenantId: string;
    profileId: string;
    roleId: string;
    permissions: Record<string, Record<string, boolean>>;
  };
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing authorization token');

    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.tenantId) throw new UnauthorizedException('Token missing tenant context');

    req.user = payload;
    req.tenantId = payload.tenantId;
    req.shopId = (req.headers['x-shop-id'] as string) || payload.shopId;

    // Set PostgreSQL session variable for RLS enforcement (session-level so it persists
    // across all queries and transactions within the same connection for this request)
    await this.dataSource.query(
      `SELECT set_config('app.current_tenant_id', $1, false)`,
      [payload.tenantId],
    );

    next();
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.substring(7);
    return null;
  }
}
