"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EventBusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBusService = void 0;
const common_1 = require("@nestjs/common");
// Local in-process event bus for dev / monolith mode.
// In production replace publish() with EventBridge / SQS calls.
let EventBusService = EventBusService_1 = class EventBusService {
    logger = new common_1.Logger(EventBusService_1.name);
    handlers = new Map();
    subscribe(eventType, handler) {
        const list = this.handlers.get(eventType) ?? [];
        list.push(handler);
        this.handlers.set(eventType, list);
    }
    async publish(type, tenantId, payload) {
        const event = { type, tenantId, payload, occurredAt: new Date() };
        this.logger.debug(`Event published: ${type} (tenant: ${tenantId})`);
        const handlers = this.handlers.get(type) ?? [];
        await Promise.allSettled(handlers.map((h) => h(event)));
    }
};
exports.EventBusService = EventBusService;
exports.EventBusService = EventBusService = EventBusService_1 = __decorate([
    (0, common_1.Injectable)()
], EventBusService);
