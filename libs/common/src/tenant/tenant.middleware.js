"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMiddleware = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("typeorm");
let TenantMiddleware = class TenantMiddleware {
    jwtService;
    dataSource;
    constructor(jwtService, dataSource) {
        this.jwtService = jwtService;
        this.dataSource = dataSource;
    }
    async use(req, _res, next) {
        const token = this.extractToken(req);
        if (!token)
            throw new common_1.UnauthorizedException('Missing authorization token');
        let payload;
        try {
            payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET,
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired token');
        }
        if (!payload.tenantId)
            throw new common_1.UnauthorizedException('Token missing tenant context');
        req.user = payload;
        req.tenantId = payload.tenantId;
        req.shopId = req.headers['x-shop-id'] || payload.shopId;
        // Set PostgreSQL session variable for RLS enforcement
        // This is the backstop — even if middleware is bypassed, RLS blocks the query
        await this.dataSource.query(`SET LOCAL app.current_tenant_id = '${payload.tenantId}'`);
        next();
    }
    extractToken(req) {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer '))
            return auth.substring(7);
        return null;
    }
};
exports.TenantMiddleware = TenantMiddleware;
exports.TenantMiddleware = TenantMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        typeorm_1.DataSource])
], TenantMiddleware);
