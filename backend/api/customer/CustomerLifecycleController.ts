import { ChangeCustomerStatus } from '../../application/customer/ChangeCustomerStatus';

export class CustomerLifecycleController {
    constructor(private changeCustomerStatus: ChangeCustomerStatus) {}

    async changeStatusEndpoint(req: any, res: any) {
        try {
            const tenantId = req.headers['x-tenant-id'];
            const idempotencyKey = req.headers['idempotency-key'];
            const customerId = req.params.customerId;
            const { newStatus, reasonCode, reasonDescription, version } = req.body;

            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID is required' });
            }

            const input = {
                newStatus,
                reasonCode,
                reasonDescription,
                version,
                updatedBy: req.user?.id || 'system' // Example context
            };

            const response = await this.changeCustomerStatus.execute(tenantId, customerId, input, idempotencyKey);
            return res.status(200).json(response);
        } catch (error: any) {
            if (error.name === 'CustomerNotFoundError') {
                return res.status(404).json({ error: error.message });
            }
            if (error.name === 'ValidationError' || error.name === 'InvalidCustomerStateTransitionError') {
                return res.status(400).json({ error: error.message });
            }
            if (error.message && error.message.includes('Concurrent modification')) {
                return res.status(409).json({ error: error.message });
            }
            
            console.error('CustomerLifecycle API Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
