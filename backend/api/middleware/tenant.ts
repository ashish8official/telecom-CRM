export {};

// Extend Express Request interface to include tenantId
declare global {
    namespace Express {
        interface Request {
            tenantId: string;
            idempotencyKey?: string;
        }
    }
}

import { Request, Response, NextFunction } from 'express';

export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.headers['x-tenant-id'];

    if (!tenantId || typeof tenantId !== 'string') {
        return res.status(400).json({
            error: {
                code: 'MISSING_TENANT_ID',
                message: 'x-tenant-id header is required',
                details: {}
            }
        });
    }

    // Validate UUID format roughly if the system expects UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
        return res.status(400).json({
            error: {
                code: 'INVALID_TENANT_ID',
                message: 'x-tenant-id header must be a valid UUID',
                details: {}
            }
        });
    }

    req.tenantId = tenantId;
    
    // Also extract idempotency key if present
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey && typeof idempotencyKey === 'string') {
        req.idempotencyKey = idempotencyKey;
    }

    next();
};
