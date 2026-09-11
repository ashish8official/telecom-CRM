import { Router, Request, Response, NextFunction } from 'express';
import { AppDependencies } from '../app';
import { CreateMasterAccount } from '../../application/customer_account/CreateMasterAccount';
import { CreateChildAccount } from '../../application/customer_account/CreateChildAccount';
import { GetCustomerAccount } from '../../application/customer_account/GetCustomerAccount';
import { UpdateCustomerAccount } from '../../application/customer_account/UpdateCustomerAccount';
import { ChangeCustomerAccountStatus } from '../../application/customer_account/ChangeCustomerAccountStatus';
import { z } from 'zod';
import { PaginationQuerySchema } from '../dto/Pagination';

export const customerAccountRouter = (deps: AppDependencies): Router => {
    const router = Router();
    
    const createMaster = new CreateMasterAccount(deps.customerAccountRepo, deps.customerRepo, deps.txManager);
    const createChild = new CreateChildAccount(deps.customerAccountRepo, deps.customerRepo, deps.txManager);
    const getAccount = new GetCustomerAccount(deps.customerAccountRepo);
    const updateAccount = new UpdateCustomerAccount(deps.customerAccountRepo);
    const changeStatus = new ChangeCustomerAccountStatus(deps.customerAccountRepo, deps.txManager, deps.idempotencyManager);

    const CreateAccountSchema = z.object({
        customerId: z.string().length(36),
        accountType: z.enum(['MASTER', 'CHILD']),
        parentAccountId: z.string().length(36).optional(),
        effectiveFrom: z.string().datetime().optional()
    }).refine(data => {
        if (data.accountType === 'CHILD' && !data.parentAccountId) {
            return false;
        }
        return true;
    }, { message: "parentAccountId is required when accountType is CHILD" });

    const UpdateAccountSchema = z.object({
        effectiveTo: z.string().datetime().optional()
    });

    const ChangeStatusSchema = z.object({
        newStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED']),
        reasonCode: z.string().min(1),
        reasonDescription: z.string().optional(),
        version: z.number().int().min(1)
    });

    const asyncHandler = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

    // GET /accounts
    router.get('/', asyncHandler(async (req: Request, res: Response) => {
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Collection retrieval use case not yet implemented for Accounts' } });
    }));

    // GET /accounts/:id
    router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
        const account = await getAccount.execute(req.tenantId, req.params.id as string);
        res.json(account);
    }));

    // POST /accounts
    router.post('/', asyncHandler(async (req: Request, res: Response) => {
        const payload = CreateAccountSchema.parse(req.body);
        
        let account;
        if (payload.accountType === 'MASTER') {
            account = await createMaster.execute(req.tenantId, {
                customerId: payload.customerId,
                effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : undefined
            });
        } else {
            account = await createChild.execute(req.tenantId, {
                customerId: payload.customerId,
                parentAccountId: payload.parentAccountId!,
                effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : undefined
            });
        }

        res.status(201).json(account);
    }));

    // PATCH /accounts/:id
    router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
        const payload = UpdateAccountSchema.parse(req.body);
        const account = await updateAccount.execute(req.tenantId, req.params.id as string, {
            effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : undefined
        });
        res.json(account);
    }));

    // POST /accounts/:id/status
    router.post('/:id/status', asyncHandler(async (req: Request, res: Response) => {
        const payload = ChangeStatusSchema.parse(req.body);
        
        const input = {
            ...payload,
            newStatus: payload.newStatus as any, // Cast to domain enum
            updatedBy: 'system' // Example context
        };

        const account = await changeStatus.execute(req.tenantId, req.params.id as string, input, req.idempotencyKey);
        res.json(account);
    }));

    return router;
};
