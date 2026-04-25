import { NestMiddleware } from '@nestjs/common';
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
export declare class TenantMiddleware implements NestMiddleware {
    private readonly jwtService;
    private readonly dataSource;
    constructor(jwtService: JwtService, dataSource: DataSource);
    use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void>;
    private extractToken;
}
