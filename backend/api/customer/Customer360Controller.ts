import { GetCustomer360 } from '../../application/customer/GetCustomer360';

export class Customer360Controller {
    constructor(private getCustomer360: GetCustomer360) {}

    async getCustomer360Endpoint(req: any, res: any) {
        try {
            const tenantId = req.headers['x-tenant-id'];
            const customerId = req.params.customerId;

            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID is required' });
            }

            const response = await this.getCustomer360.execute(tenantId, customerId);
            return res.status(200).json(response);
        } catch (error: any) {
            if (error.name === 'CustomerNotFoundError') {
                return res.status(404).json({ error: error.message });
            }
            if (error.name === 'ValidationError') {
                return res.status(400).json({ error: error.message });
            }
            // Add other centralized error handling
            console.error('Customer360 API Error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
