import { ExternalServiceUnavailableError } from '../../domain/catalogue/CatalogueErrors';

export enum CircuitBreakerState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryIntervalMs: number;
    timeoutMs: number;
}

export class CircuitBreaker {
    private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private failureCount = 0;
    private nextAttemptTime = 0;

    constructor(private config: CircuitBreakerConfig) {}

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === CircuitBreakerState.OPEN) {
            if (Date.now() > this.nextAttemptTime) {
                this.state = CircuitBreakerState.HALF_OPEN;
            } else {
                throw new ExternalServiceUnavailableError('Catalogue', 'Circuit Breaker is OPEN');
            }
        }

        try {
            const result = await this.withTimeout(operation, this.config.timeoutMs);
            this.onSuccess();
            return result;
        } catch (error: any) {
            this.onFailure(error);
            throw error;
        }
    }

    private onSuccess() {
        this.failureCount = 0;
        this.state = CircuitBreakerState.CLOSED;
    }

    private onFailure(error: any) {
        if (this.isTransient(error)) {
            this.failureCount++;
            if (this.failureCount >= this.config.failureThreshold) {
                this.state = CircuitBreakerState.OPEN;
                this.nextAttemptTime = Date.now() + this.config.recoveryIntervalMs;
            }
        }
    }

    private isTransient(error: any): boolean {
        // e.g. Network timeout, 502, 503, 504
        if (error instanceof ExternalServiceUnavailableError) return true;
        if (error.name === 'TimeoutError' || error.code === 'ECONNREFUSED') return true;
        if (error.status && [502, 503, 504].includes(error.status)) return true;
        return false;
    }

    private withTimeout<T>(operation: () => Promise<T>, ms: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new ExternalServiceUnavailableError('Catalogue', `Operation timed out after ${ms}ms`));
            }, ms);

            operation().then(res => {
                clearTimeout(timer);
                resolve(res);
            }).catch(err => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    getState(): CircuitBreakerState {
        return this.state;
    }
}

export async function withBoundedRetry<T>(
    operation: () => Promise<T>, 
    maxAttempts: number = 3, 
    baseDelayMs: number = 500
): Promise<T> {
    let attempt = 0;
    while (attempt < maxAttempts) {
        try {
            return await operation();
        } catch (error: any) {
            attempt++;
            const isTransient = error instanceof ExternalServiceUnavailableError || error.code === 'ECONNREFUSED' || (error.status && [502, 503, 504].includes(error.status));
            
            if (!isTransient || attempt >= maxAttempts) {
                throw error;
            }
            
            // Exponential backoff
            await new Promise(res => setTimeout(res, baseDelayMs * Math.pow(2, attempt - 1)));
        }
    }
    throw new Error("Unreachable");
}
