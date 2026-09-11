import { Router, Request, Response, NextFunction } from 'express';
import { AppDependencies } from '../app';
import { CreateSubscriber } from '../../application/subscriber/CreateSubscriber';
import { GetSubscriber } from '../../application/subscriber/GetSubscriber';
import { ChangeSubscriberStatus } from '../../application/subscriber/ChangeSubscriberStatus';
import { z } from 'zod';
import { PaginationQuerySchema } from '../dto/Pagination';
import { SubscriberStatus } from '../../domain/subscriber/SubscriberTypes';

export const subscriberRouter = (deps: AppDependencies): Router => {
    const router = Router();
    
    const createSubscriber = new CreateSubscriber(deps.subscriberRepo, deps.customerAccountRepo, deps.txManager, deps.idempotencyManager);
    const getSubscriber = new GetSubscriber(deps.subscriberRepo);
    const changeStatus = new ChangeSubscriberStatus(deps.subscriberRepo, deps.txManager, deps.idempotencyManager);

    const CreateSubscriberSchema = z.object({
        customerAccountId: z.string().length(36),
        serviceCategory: z.string().min(1),
        serviceMode: z.string().min(1),
        subscriberCode: z.string().min(1).optional()
    });

    const ChangeStatusSchema = z.object({
        newStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED']),
        reasonCode: z.string().min(1),
        reasonDescription: z.string().optional(),
        version: z.number().int().min(1)
    });

    const asyncHandler = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

    // GET /subscribers
    router.get('/', asyncHandler(async (req: Request, res: Response) => {
        if (req.query.subscriberCode && typeof req.query.subscriberCode === 'string') {
            const subscriber = await deps.subscriberRepo.getSubscriberByCode(req.tenantId, req.query.subscriberCode);
            return res.json(subscriber ? [subscriber] : []);
        }
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Collection retrieval use case not yet implemented for Subscribers' } });
    }));

    // GET /subscribers/:id
    router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
        const subscriber = await getSubscriber.execute(req.tenantId, req.params.id as string);
        res.json(subscriber);
    }));

    // POST /subscribers
    router.post('/', asyncHandler(async (req: Request, res: Response) => {
        const payload = CreateSubscriberSchema.parse(req.body);
        
        const subscriber = await createSubscriber.execute(req.tenantId, {
            ...payload
        }, req.idempotencyKey);

        res.status(201).json(subscriber);
    }));

    // PATCH /subscribers/:id
    router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
        // No UpdateSubscriber use case exists
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Update use case not yet implemented for Subscribers' } });
    }));

    // POST /subscribers/:id/status
    router.post('/:id/status', asyncHandler(async (req: Request, res: Response) => {
        const payload = ChangeStatusSchema.parse(req.body);
        
        const input = {
            ...payload,
            newStatus: payload.newStatus as SubscriberStatus,
            updatedBy: 'system' // Normally from req.user
        };

        const subscriber = await changeStatus.execute(req.tenantId, req.params.id as string, input, req.idempotencyKey);
        res.json(subscriber);
    }));

    return router;
};
