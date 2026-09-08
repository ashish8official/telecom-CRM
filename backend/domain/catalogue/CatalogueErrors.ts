import { DomainError } from '../common/errors/DomainError';

export class ExternalServiceUnavailableError extends DomainError {
    constructor(serviceName: string, reason: string) {
        super('EXTERNAL_SERVICE_UNAVAILABLE', `External service ${serviceName} is unavailable: ${reason}`, { status: 503 });
    }
}

export class ExternalServiceContractViolationError extends DomainError {
    constructor(serviceName: string, details: string) {
        super('EXTERNAL_SERVICE_CONTRACT_VIOLATION', `External service ${serviceName} violated contract: ${details}`, { status: 502 });
    }
}

export class ExternalServiceCapabilityUnsupportedError extends DomainError {
    constructor(serviceName: string, capability: string) {
        super('EXTERNAL_SERVICE_CAPABILITY_UNSUPPORTED', `External service ${serviceName} does not support capability: ${capability}`, { status: 501 });
    }
}
