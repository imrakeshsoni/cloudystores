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
exports.User = void 0;
const typeorm_1 = require("typeorm");
const common_1 = require("@shoposphere/common");
let User = class User extends common_1.TenantScopedEntity {
    shopId;
    cognitoSub;
    email;
    phone;
    name;
    passwordHash;
    profileId;
    roleId;
    isActive;
    isPlatformAdmin;
    lastLogin;
    refreshTokenHash;
};
exports.User = User;
__decorate([
    (0, typeorm_1.Column)({ name: 'shop_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "shopId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cognito_sub', nullable: true, unique: true }),
    __metadata("design:type", String)
], User.prototype, "cognitoSub", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], User.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'password_hash', nullable: true, select: false }),
    __metadata("design:type", String)
], User.prototype, "passwordHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'profile_id', type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "profileId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'role_id', type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "roleId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', default: true }),
    __metadata("design:type", Boolean)
], User.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_platform_admin', default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "isPlatformAdmin", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_login', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], User.prototype, "lastLogin", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'refresh_token_hash', nullable: true, select: false }),
    __metadata("design:type", String)
], User.prototype, "refreshTokenHash", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('users'),
    (0, typeorm_1.Index)(['tenantId', 'email'], { unique: true })
], User);
