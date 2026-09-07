export abstract class DomainError extends Error {
    constructor(public readonly code: string, message: string, public readonly details?: any) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class ValidationError extends DomainError {
    constructor(message: string, details?: any) {
        super('VALIDATION_ERROR', message, details);
    }
}

export class PartyNotFoundError extends DomainError {
    constructor(id: string, tenantId: string) {
        super('PARTY_NOT_FOUND', `Party ${id} not found in tenant ${tenantId}`);
    }
}

export class InvalidPartyTypeError extends DomainError {
    constructor(expected: string, actual: string) {
        super('INVALID_PARTY_TYPE', `Expected party type ${expected}, got ${actual}`);
    }
}

export class PartyDeletedError extends DomainError {
    constructor(id: string) {
        super('PARTY_DELETED', `Party ${id} is deleted and cannot be modified.`);
    }
}

export class InvalidPartyStateTransitionError extends DomainError {
    constructor(from: string, to: string) {
        super('INVALID_STATE_TRANSITION', `Cannot transition party status from ${from} to ${to}`);
    }
}
