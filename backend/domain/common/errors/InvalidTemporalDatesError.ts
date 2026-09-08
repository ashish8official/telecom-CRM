import { DomainError } from './DomainError';

export class InvalidTemporalDatesError extends DomainError {
    constructor() {
        super('INVALID_TEMPORAL_DATES', `effectiveTo must be greater than or equal to effectiveFrom`);
    }
}
