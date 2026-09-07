import { DomainError } from '../party/PartyErrors';

export class CustomerNotFoundError extends DomainError {
    constructor(id: string, tenantId: string) {
        super('CUSTOMER_NOT_FOUND', `Customer ${id} not found in tenant ${tenantId}`);
    }
}

export class CustomerAlreadyExistsError extends DomainError {
    constructor(partyId: string, tenantId: string) {
        super('CUSTOMER_ALREADY_EXISTS', `An active customer relationship already exists for party ${partyId} in tenant ${tenantId}`);
    }
}

export class InvalidCustomerStatusError extends DomainError {
    constructor(status: string) {
        super('INVALID_CUSTOMER_STATUS', `Invalid customer status: ${status}`);
    }
}

export class InvalidCustomerStateTransitionError extends DomainError {
    constructor(from: string, to: string) {
        super('INVALID_CUSTOMER_STATE_TRANSITION', `Cannot transition customer status from ${from} to ${to}`);
    }
}

export class PartyNotEligibleForCustomerError extends DomainError {
    constructor(partyId: string, reason: string) {
        super('PARTY_NOT_ELIGIBLE', `Party ${partyId} is not eligible for a customer relationship: ${reason}`);
    }
}

export class InvalidTemporalDatesError extends DomainError {
    constructor() {
        super('INVALID_TEMPORAL_DATES', `effectiveTo must be greater than or equal to effectiveFrom`);
    }
}
