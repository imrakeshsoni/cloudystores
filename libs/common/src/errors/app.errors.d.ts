import { HttpException } from '@nestjs/common';
export declare class TenantNotFoundException extends HttpException {
    constructor(slug: string);
}
export declare class TenantSuspendedException extends HttpException {
    constructor();
}
export declare class PlanLimitExceededException extends HttpException {
    constructor(resource: string, limit: number);
}
export declare class DuplicateResourceException extends HttpException {
    constructor(resource: string, field: string);
}
export declare class InsufficientStockException extends HttpException {
    constructor(productName: string, available: number, requested: number);
}
