import { DomainError } from '../errors/DomainError';

export class IdempotencyKeyReusedWithDifferentRequestError extends DomainError {
    constructor(operation: string, key: string) {
        super('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST', `Idempotency key ${key} for operation ${operation} was reused with a different request payload`, { status: 409 });
    }
}

export class IdempotencyRequestInProgressError extends DomainError {
    constructor(operation: string, key: string) {
        super('IDEMPOTENCY_REQUEST_IN_PROGRESS', `A request with idempotency key ${key} for operation ${operation} is currently in progress`, { status: 409 });
    }
}
