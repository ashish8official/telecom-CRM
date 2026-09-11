import { ChangeCustomerAccountStatus } from '../../application/customer_account/ChangeCustomerAccountStatus';

export class CustomerAccountLifecycleController {
    constructor(private changeAccountStatus: ChangeCustomerAccountStatus) {}

    async changeStatusEndpoint(req: any, res: any) {
        try {
            const tenantId = req.headers['x-tenant-id'];
            const idempotencyKey = req.headers['idempotency-key'];
            const accountId = req.params.accountId;
            const { newStatus, reasonCode, reasonDescription, version } = req.body;

            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID is required' });
            }

            const input = {
                newStatus,
                reasonCode,
                reasonDescription,
                version,
                updatedBy: req.user?.id || 'system'
            };

            const response = await this.changeAccountStatus.execute(tenantId, accountId, input, idempotencyKey);
            return res.status(200).json(response);
        } catch (error: any) {
            if (error.name === 'CustomerAccountNotFoundError') {
                return res.status(404).json({ error: error.message });
            }
            if (error.name === 'ValidationError' || 
                error.name === 'InvalidAccountStateTransitionError' ||
                error.name === 'AccountHasActiveChildrenError') {
                return res.status(400).json({ error: error.message });
            }
            if (error.message && error.message.includes('Concurrent modification')) {
                return res.status(409).json({ error: error.message });
            }
            
            console.error('CustomerAccountLifecycle API Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
