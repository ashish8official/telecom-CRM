"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidPartyStateTransitionError = exports.PartyDeletedError = exports.InvalidPartyTypeError = exports.PartyNotFoundError = exports.ValidationError = exports.DomainError = void 0;
class DomainError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = this.constructor.name;
    }
}
exports.DomainError = DomainError;
class ValidationError extends DomainError {
    constructor(message, details) {
        super('VALIDATION_ERROR', message, details);
    }
}
exports.ValidationError = ValidationError;
class PartyNotFoundError extends DomainError {
    constructor(id, tenantId) {
        super('PARTY_NOT_FOUND', `Party ${id} not found in tenant ${tenantId}`);
    }
}
exports.PartyNotFoundError = PartyNotFoundError;
class InvalidPartyTypeError extends DomainError {
    constructor(expected, actual) {
        super('INVALID_PARTY_TYPE', `Expected party type ${expected}, got ${actual}`);
    }
}
exports.InvalidPartyTypeError = InvalidPartyTypeError;
class PartyDeletedError extends DomainError {
    constructor(id) {
        super('PARTY_DELETED', `Party ${id} is deleted and cannot be modified.`);
    }
}
exports.PartyDeletedError = PartyDeletedError;
class InvalidPartyStateTransitionError extends DomainError {
    constructor(from, to) {
        super('INVALID_STATE_TRANSITION', `Cannot transition party status from ${from} to ${to}`);
    }
}
exports.InvalidPartyStateTransitionError = InvalidPartyStateTransitionError;
