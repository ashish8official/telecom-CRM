import { DomainError } from '../common/errors/DomainError';

export class CustomerAccountNotFoundError extends DomainError {
    constructor(id: string, tenantId: string) {
        super('CUSTOMER_ACCOUNT_NOT_FOUND', `Customer Account ${id} not found in tenant ${tenantId}`);
    }
}

export class ParentAccountNotFoundError extends DomainError {
    constructor(id: string, tenantId: string) {
        super('PARENT_ACCOUNT_NOT_FOUND', `Parent Customer Account ${id} not found in tenant ${tenantId}`);
    }
}

export class InvalidParentAccountError extends DomainError {
    constructor(reason: string) {
        super('INVALID_PARENT_ACCOUNT', `Invalid parent account: ${reason}`);
    }
}

export class CrossCustomerAccountHierarchyError extends DomainError {
    constructor() {
        super('CROSS_CUSTOMER_HIERARCHY', `A child account must belong to the same customer as its parent account.`);
    }
}

export class AccountHasActiveChildrenError extends DomainError {
    constructor(id: string) {
        super('ACCOUNT_HAS_ACTIVE_CHILDREN', `Cannot close Master Account ${id} because it has active or suspended child accounts.`);
    }
}

export class InvalidAccountStateTransitionError extends DomainError {
    constructor(from: string, to: string) {
        super('INVALID_ACCOUNT_STATE_TRANSITION', `Cannot transition account status from ${from} to ${to}`);
    }
}

export class AccountHierarchyCycleError extends DomainError {
    constructor() {
        super('ACCOUNT_HIERARCHY_CYCLE', `Account hierarchy cycle detected.`);
    }
}
