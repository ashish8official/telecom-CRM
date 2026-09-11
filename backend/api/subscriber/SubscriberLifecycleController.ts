import { ChangeSubscriberStatus } from '../../application/subscriber/ChangeSubscriberStatus';

export class SubscriberLifecycleController {
    constructor(private changeSubscriberStatus: ChangeSubscriberStatus) {}

    async changeStatusEndpoint(req: any, res: any) {
        try {
            const tenantId = req.headers['x-tenant-id'];
            const idempotencyKey = req.headers['idempotency-key'];
            const subscriberId = req.params.subscriberId;
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

            const response = await this.changeSubscriberStatus.execute(tenantId, subscriberId, input, idempotencyKey);
            return res.status(200).json(response);
        } catch (error: any) {
            if (error.name === 'SubscriberNotFoundError') {
                return res.status(404).json({ error: error.message });
            }
            if (error.name === 'ValidationError' || error.name === 'InvalidSubscriberStatusTransitionError') {
                return res.status(400).json({ error: error.message });
            }
            if (error.message && error.message.includes('Concurrent modification')) {
                return res.status(409).json({ error: error.message });
            }
            
            console.error('SubscriberLifecycle API Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
