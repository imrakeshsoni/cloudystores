import { HttpException, HttpStatus } from '@nestjs/common';

export class TenantNotFoundException extends HttpException {
  constructor(slug: string) {
    super(`Tenant '${slug}' not found`, HttpStatus.NOT_FOUND);
  }
}

export class TenantSuspendedException extends HttpException {
  constructor() {
    super('Account is suspended. Please contact support.', HttpStatus.FORBIDDEN);
  }
}

export class PlanLimitExceededException extends HttpException {
  constructor(resource: string, limit: number) {
    super(
      `Plan limit reached: maximum ${limit} ${resource} allowed. Please upgrade your plan.`,
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export class DuplicateResourceException extends HttpException {
  constructor(resource: string, field: string) {
    super(
      `${resource} with this ${field} already exists`,
      HttpStatus.CONFLICT,
    );
  }
}

export class InsufficientStockException extends HttpException {
  constructor(productName: string, available: number, requested: number) {
    super(
      `Insufficient stock for '${productName}': available ${available}, requested ${requested}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
