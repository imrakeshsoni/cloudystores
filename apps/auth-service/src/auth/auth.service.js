"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcryptjs"));
const users_service_1 = require("../users/users.service");
let AuthService = AuthService_1 = class AuthService {
    usersService;
    jwtService;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(usersService, jwtService) {
        this.usersService = usersService;
        this.jwtService = jwtService;
    }
    async login(dto) {
        // Resolve tenant by slug (injected via DataSource in a real setup)
        // For clarity, the tenant lookup is done via raw query in the controller/resolver
        throw new Error('Use loginWithTenant instead');
    }
    async loginWithTenant(email, password, tenant) {
        if (tenant.status === 'suspended') {
            throw new common_1.UnauthorizedException('Account suspended. Contact support.');
        }
        const user = await this.usersService.findByEmailAndTenant(email, tenant.id);
        if (!user)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const { accessToken, refreshToken } = await this.generateTokens(user, tenant);
        await this.usersService.updateRefreshToken(user.id, refreshToken);
        await this.usersService.updateLastLogin(user.id);
        this.logger.log(`User ${user.email} logged in (tenant: ${tenant.slug})`);
        return {
            accessToken,
            refreshToken,
            expiresIn: Number(process.env.JWT_EXPIRY ?? 3600),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                tenantId: user.tenantId,
            },
        };
    }
    async refresh(dto) {
        let payload;
        try {
            payload = this.jwtService.verify(dto.refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET,
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired refresh token');
        }
        const valid = await this.usersService.validateRefreshToken(payload.sub, dto.refreshToken);
        if (!valid)
            throw new common_1.UnauthorizedException('Refresh token revoked');
        const user = await this.usersService.findWithPermissions(payload.sub);
        const tenant = { id: user.tenantId, slug: payload.tenantSlug, status: 'active' };
        const { accessToken, refreshToken } = await this.generateTokens(user, tenant);
        await this.usersService.updateRefreshToken(user.id, refreshToken);
        return { accessToken, refreshToken, expiresIn: Number(process.env.JWT_EXPIRY ?? 3600) };
    }
    async logout(userId) {
        await this.usersService.updateRefreshToken(userId, null);
    }
    async generateTokens(user, tenant) {
        const userWithPerms = await this.usersService.findWithPermissions(user.id);
        const jwtPayload = {
            sub: user.id,
            email: user.email,
            tenantId: user.tenantId,
            tenantSlug: tenant.slug,
            shopId: user.shopId,
            profileId: user.profileId,
            roleId: user.roleId,
            isPlatformAdmin: user.isPlatformAdmin,
            permissions: userWithPerms.permissions ?? {},
        };
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(jwtPayload, {
                secret: process.env.JWT_SECRET,
                expiresIn: process.env.JWT_EXPIRY ?? '3600s',
            }),
            this.jwtService.signAsync({ sub: user.id, tenantSlug: tenant.slug }, {
                secret: process.env.JWT_REFRESH_SECRET,
                expiresIn: process.env.JWT_REFRESH_EXPIRY ?? '7d',
            }),
        ]);
        return { accessToken, refreshToken };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        jwt_1.JwtService])
], AuthService);
