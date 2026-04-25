"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsufficientStockException = exports.DuplicateResourceException = exports.PlanLimitExceededException = exports.TenantSuspendedException = exports.TenantNotFoundException = void 0;
const common_1 = require("@nestjs/common");
class TenantNotFoundException extends common_1.HttpException {
    constructor(slug) {
        super(`Tenant '${slug}' not found`, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.TenantNotFoundException = TenantNotFoundException;
class TenantSuspendedException extends common_1.HttpException {
    constructor() {
        super('Account is suspended. Please contact support.', common_1.HttpStatus.FORBIDDEN);
    }
}
exports.TenantSuspendedException = TenantSuspendedException;
class PlanLimitExceededException extends common_1.HttpException {
    constructor(resource, limit) {
        super(`Plan limit reached: maximum ${limit} ${resource} allowed. Please upgrade your plan.`, common_1.HttpStatus.PAYMENT_REQUIRED);
    }
}
exports.PlanLimitExceededException = PlanLimitExceededException;
class DuplicateResourceException extends common_1.HttpException {
    constructor(resource, field) {
        super(`${resource} with this ${field} already exists`, common_1.HttpStatus.CONFLICT);
    }
}
exports.DuplicateResourceException = DuplicateResourceException;
class InsufficientStockException extends common_1.HttpException {
    constructor(productName, available, requested) {
        super(`Insufficient stock for '${productName}': available ${available}, requested ${requested}`, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
exports.InsufficientStockException = InsufficientStockException;
