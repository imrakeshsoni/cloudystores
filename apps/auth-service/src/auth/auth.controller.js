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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const typeorm_1 = require("typeorm");
const auth_service_1 = require("./auth.service");
const login_dto_1 = require("./dto/login.dto");
const common_2 = require("@shoposphere/common");
let AuthController = class AuthController {
    authService;
    dataSource;
    constructor(authService, dataSource) {
        this.authService = authService;
        this.dataSource = dataSource;
    }
    async login(dto) {
        const [tenant] = await this.dataSource.query(`SELECT id, slug, status FROM tenants WHERE slug = $1 LIMIT 1`, [dto.tenantSlug]);
        if (!tenant) {
            // Return same error as bad credentials to prevent tenant enumeration
            throw new Error('Invalid credentials');
        }
        const result = await this.authService.loginWithTenant(dto.email, dto.password, tenant);
        return (0, common_2.successResponse)(result);
    }
    async refresh(dto) {
        const result = await this.authService.refresh(dto);
        return (0, common_2.successResponse)(result);
    }
    async logout(req) {
        if (req.user?.sub) {
            await this.authService.logout(req.user.sub);
        }
    }
    // Health check (also useful for token validation by other services)
    health() {
        return (0, common_2.successResponse)({ status: 'ok', service: 'auth' });
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ login: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "health", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        typeorm_1.DataSource])
], AuthController);
