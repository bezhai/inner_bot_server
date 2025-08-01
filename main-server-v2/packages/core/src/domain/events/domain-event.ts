export interface DomainEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  occurredAt: Date;
  payload: Record<string, any>;
}

export abstract class BaseDomainEvent implements DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, any>;

  constructor(aggregateId: string, payload: Record<string, any>) {
    this.eventId = this.generateEventId();
    this.eventType = this.constructor.name;
    this.aggregateId = aggregateId;
    this.occurredAt = new Date();
    this.payload = payload;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}