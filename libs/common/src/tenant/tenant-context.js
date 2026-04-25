"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = exports.CurrentTenant = void 0;
const common_1 = require("@nestjs/common");
exports.CurrentTenant = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return {
        tenantId: request.tenantId,
        shopId: request.shopId,
        userId: request.user?.sub,
    };
});
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, ctx) => {
    return ctx.switchToHttp().getRequest().user;
});
