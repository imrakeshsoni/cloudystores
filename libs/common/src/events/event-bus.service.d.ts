export interface DomainEvent {
    type: string;
    tenantId: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
}
export declare class EventBusService {
    private readonly logger;
    private readonly handlers;
    subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void;
    publish(type: string, tenantId: string, payload: Record<string, unknown>): Promise<void>;
}
