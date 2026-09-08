import { DomainError } from '../common/errors/DomainError';
import { ValidationError } from '../common/errors/ValidationError';

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
