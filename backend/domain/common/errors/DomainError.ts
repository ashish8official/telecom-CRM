export abstract class DomainError extends Error {
    constructor(public readonly code: string, message: string, public readonly details?: any) {
        super(message);
        this.name = this.constructor.name;
    }
}
