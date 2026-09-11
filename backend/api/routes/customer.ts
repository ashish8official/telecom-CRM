import { Router, Request, Response, NextFunction } from 'express';
import { AppDependencies } from '../app';
import { CreateCustomer } from '../../application/customer/CreateCustomer';
import { GetCustomer } from '../../application/customer/GetCustomer';
import { UpdateCustomer } from '../../application/customer/UpdateCustomer';
import { ChangeCustomerStatus } from '../../application/customer/ChangeCustomerStatus';
import { GetCustomer360 } from '../../application/customer/GetCustomer360';
import { z } from 'zod';
import { PaginationQuerySchema } from '../dto/Pagination';

export const customerRouter = (deps: AppDependencies): Router => {
    const router = Router();
    
    const createCustomer = new CreateCustomer(deps.customerRepo, deps.partyRepo, deps.txManager);
    const getCustomer = new GetCustomer(deps.customerRepo);
    const updateCustomer = new UpdateCustomer(deps.customerRepo);
    const changeStatus = new ChangeCustomerStatus(deps.customerRepo, deps.txManager, deps.idempotencyManager);
    const getCustomer360 = new GetCustomer360(deps.customerRepo, deps.customerAccountRepo, deps.subscriberRepo, deps.cataloguePort);

    const CreateCustomerSchema = z.object({
        partyId: z.string().length(36),
        customerCategory: z.string().optional(),
        customerSegment: z.string().optional(),
        effectiveFrom: z.string().datetime().optional(),
        effectiveTo: z.string().datetime().optional()
    });

    const UpdateCustomerSchema = z.object({
        effectiveTo: z.string().datetime().optional()
    });

    const ChangeStatusSchema = z.object({
        newStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED']),
        reasonCode: z.string().min(1),
        reasonDescription: z.string().optional(),
        version: z.number().int().min(1)
    });

    // Error catching wrapper for async routes
    const asyncHandler = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

    // GET /customers
    router.get('/', asyncHandler(async (req: Request, res: Response) => {
        if (req.query.partyId && typeof req.query.partyId === 'string') {
            const customer = await deps.customerRepo.getCustomerByPartyId(req.tenantId, req.query.partyId);
            return res.json(customer ? [customer] : []);
        }
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Collection retrieval use case not yet implemented for Customers' } });
    }));

    // GET /customers/:id
    router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
        const customer = await getCustomer.execute(req.tenantId, req.params.id as string);
        res.json(customer);
    }));

    // POST /customers
    router.post('/', asyncHandler(async (req: Request, res: Response) => {
        const payload = CreateCustomerSchema.parse(req.body);
        
        const customer = await createCustomer.execute(req.tenantId, {
            ...payload,
            effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : undefined,
            effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : undefined
        });
        res.status(201).json(customer);
    }));

    // PATCH /customers/:id
    router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
        const payload = UpdateCustomerSchema.parse(req.body);
        const customer = await updateCustomer.execute(req.tenantId, req.params.id as string, {
            effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : undefined
        });
        res.json(customer);
    }));

    // POST /customers/:id/status
    router.post('/:id/status', asyncHandler(async (req: Request, res: Response) => {
        const payload = ChangeStatusSchema.parse(req.body);
        
        const input = {
            ...payload,
            newStatus: payload.newStatus as any, // Cast to domain enum
            updatedBy: 'system' // Normally from req.user
        };

        const customer = await changeStatus.execute(req.tenantId, req.params.id as string, input, req.idempotencyKey);
        res.json(customer);
    }));

    // GET /customers/:id/360
    router.get('/:id/360', asyncHandler(async (req: Request, res: Response) => {
        const response = await getCustomer360.execute(req.tenantId, req.params.id as string);
        res.json(response);
    }));

    return router;
};
