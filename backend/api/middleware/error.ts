import { Request, Response, NextFunction } from 'express';

// Define standard API Error response format
export interface ApiErrorResponse {
    error: {
        code: string;
        message: string;
        details?: any;
    };
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.log("ERROR CAUGHT:", err);

    let statusCode = 500;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: any = {};

    const errorName = err.name || err.constructor.name;

    // 1. Zod Validation Errors
    if (errorName === 'ZodError' || (err && err.errors && Array.isArray(err.errors) && err.issues)) {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        message = 'Invalid request parameters';
        details = err.errors;
    } 
    // 2. Domain/Application Validation Errors
    else if (errorName === 'ValidationError') {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        message = err.message;
    }
    // 3. Not Found Errors
    else if (errorName === 'CustomerNotFoundError' || 
             errorName === 'CustomerAccountNotFoundError' || 
             errorName === 'SubscriberNotFoundError' ||
             errorName === 'PartyNotFoundError' ||
             errorName === 'ParentAccountNotFoundError') {
        statusCode = 404;
        errorCode = 'RESOURCE_NOT_FOUND';
        message = err.message;
    }
    // 4. Bad Request / Conflict (Business Rules)
    else if (errorName === 'InvalidCustomerStateTransitionError' || 
             errorName === 'InvalidAccountStateTransitionError' || 
             errorName === 'InvalidSubscriberStatusTransitionError') {
        statusCode = 400;
        errorCode = 'INVALID_STATE_TRANSITION';
        message = err.message;
    }
    else if (errorName === 'AccountHasActiveChildrenError') {
        statusCode = 400;
        errorCode = 'ACCOUNT_HAS_ACTIVE_CHILDREN';
        message = err.message;
    }
    else if (errorName === 'CustomerAlreadyExistsError' || 
             errorName === 'SubscriberAlreadyExistsError') {
        statusCode = 409;
        errorCode = 'RESOURCE_ALREADY_EXISTS';
        message = err.message;
    }
    else if (errorName === 'CrossCustomerAccountHierarchyError' || 
             errorName === 'InvalidParentAccountError' ||
             errorName === 'PartyNotEligibleForCustomerError') {
        statusCode = 400;
        errorCode = 'BUSINESS_RULE_VIOLATION';
        message = err.message;
    }
    else if (errorName === 'InvalidTemporalDatesError') {
        statusCode = 400;
        errorCode = 'INVALID_TEMPORAL_DATES';
        message = err.message;
    }
    // 5. Concurrency / Idempotency Conflicts
    else if (errorName === 'ConcurrencyConflictError' || (err.message && err.message.includes('Concurrent modification'))) {
        statusCode = 409;
        errorCode = 'CONCURRENCY_CONFLICT';
        message = 'Resource was modified by another request. Please reload and try again.';
    }
    else if (errorName === 'IdempotencyConflictError') {
        statusCode = 409;
        errorCode = 'IDEMPOTENCY_CONFLICT';
        message = err.message;
    }

    const response: ApiErrorResponse = {
        error: {
            code: errorCode,
            message: message,
            ...(details && (Array.isArray(details) ? details.length > 0 : Object.keys(details).length > 0) ? { details } : {})
        }
    };

    res.status(statusCode).json(response);
};
