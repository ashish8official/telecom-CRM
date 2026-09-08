import { DomainError } from '../common/errors/DomainError';

export class SubscriberNotFoundError extends DomainError {
    constructor(subscriberId: string, tenantId: string) {
        super(`Subscriber ${subscriberId} not found in tenant ${tenantId}`, 'SUBSCRIBER_NOT_FOUND', 404);
    }
}

export class InvalidSubscriberStatusTransitionError extends DomainError {
    constructor(current: string, target: string) {
        super(`Cannot transition subscriber status from ${current} to ${target}`, 'INVALID_SUBSCRIBER_STATUS_TRANSITION', 409);
    }
}

export class DuplicateSubscriberError extends DomainError {
    constructor(code: string, tenantId: string) {
        super(`Subscriber with code ${code} already exists in tenant ${tenantId}`, 'DUPLICATE_SUBSCRIBER', 409);
    }
}

export class ConcurrentModificationError extends DomainError {
    constructor(subscriberId: string) {
        super(`Concurrent modification detected for subscriber ${subscriberId}`, 'CONCURRENT_MODIFICATION', 409);
    }
}
