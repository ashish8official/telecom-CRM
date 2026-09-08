import { DomainError } from './DomainError';

export class ValidationError extends DomainError {
    constructor(message: string, details?: any) {
        super('VALIDATION_ERROR', message, details);
    }
}
