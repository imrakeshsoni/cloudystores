import { Injectable, Logger } from '@nestjs/common';

export interface DomainEvent {
  type: string;
  tenantId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

// Local in-process event bus for dev / monolith mode.
// In production replace publish() with EventBridge / SQS calls.
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly handlers = new Map<string, Array<(event: DomainEvent) => Promise<void>>>();

  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }

  async publish(type: string, tenantId: string, payload: Record<string, unknown>): Promise<void> {
    const event: DomainEvent = { type, tenantId, payload, occurredAt: new Date() };
    this.logger.debug(`Event published: ${type} (tenant: ${tenantId})`);

    const handlers = this.handlers.get(type) ?? [];
    await Promise.allSettled(handlers.map((h) => h(event)));
  }
}
