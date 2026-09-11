import { Pool } from 'pg';
import { PostgresSubscriberRepository } from '../../infrastructure/repositories/PostgresSubscriberRepository';
import { PostgresCustomerAccountRepository } from '../../infrastructure/repositories/PostgresCustomerAccountRepository';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository';
import { PostgresTransactionManager } from '../../infrastructure/database/TransactionManager';
import { GetCustomer360 } from '../../application/customer/GetCustomer360';
import { CataloguePort } from '../../domain/catalogue/CataloguePort';
import { CatalogueDiscoveryStatus, DiscoveryMode, EligibilityStatus, PriceResolutionStatus } from '../../domain/catalogue/CatalogueTypes';
import { CustomerNotFoundError } from '../../domain/customer/CustomerErrors';

require('dotenv').config();
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

class MockCataloguePort implements CataloguePort {
    public shouldFail = false;
    public emptyResults = false;

    getCapabilities() {
        return {
            supportsBasicOfferingDiscovery: true,
            supportsOfferingDetails: true,
            supportsPriceLookup: true,
            supportsContextualEligibility: true,
            supportsBundleResolution: false
        };
    }

    async discoverOfferings(context: any): Promise<any> {
        if (this.shouldFail) {
            throw new Error("Simulated Catalogue Timeout/503");
        }

        if (this.emptyResults) {
            return {
                status: CatalogueDiscoveryStatus.NO_RESULTS,
                discoveryMode: DiscoveryMode.CONTEXTUAL_ELIGIBILITY,
                eligibilityStatus: EligibilityStatus.EVALUATED,
                priceResolutionStatus: PriceResolutionStatus.PRICE_RESOLVED,
                capabilitiesUsed: this.getCapabilities(),
                offerings: []
            };
        }

        return {
            status: CatalogueDiscoveryStatus.SUCCESS,
            discoveryMode: DiscoveryMode.CONTEXTUAL_ELIGIBILITY,
            eligibilityStatus: EligibilityStatus.EVALUATED,
            priceResolutionStatus: PriceResolutionStatus.PRICE_RESOLVED,
            capabilitiesUsed: this.getCapabilities(),
            offerings: [
                {
                    id: 'offer-1',
                    name: 'Mock Product',
                    lifecycleStatus: 'Active',
                    prices: []
                }
            ]
        };
    }

    async getOffering(tenantId: string, offeringId: string, context?: any): Promise<any> {
        return null;
    }
}

describe('Customer 360 Aggregation Tests', () => {
    let pool: Pool;
    let subscriberRepo: PostgresSubscriberRepository;
    let accountRepo: PostgresCustomerAccountRepository;
    let customerRepo: PostgresCustomerRepository;
    let mockCatalogue: MockCataloguePort;
    let getCustomer360: GetCustomer360;

    const tenantA = '88888888-8888-8888-8888-888888888888';
    let customerId: string;
    let masterAccountId: string;
    let childAccountId: string;

    beforeAll(async () => {
        pool = new Pool({ connectionString });
        subscriberRepo = new PostgresSubscriberRepository(pool);
        accountRepo = new PostgresCustomerAccountRepository(pool);
        customerRepo = new PostgresCustomerRepository(pool);
        mockCatalogue = new MockCataloguePort();
        
        getCustomer360 = new GetCustomer360(customerRepo, accountRepo, subscriberRepo, mockCatalogue);

        // Cleanup DB for this tenant
        await pool.query('DELETE FROM subscriber_status_history WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM subscriber WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM customer_account WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM customer WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM party WHERE tenant_id = $1', [tenantA]);
        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'SUB_360', 'Tenant 360') ON CONFLICT DO NOTHING`, [tenantA]);

        // Create Master Data
        const p1 = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INDIVIDUAL') RETURNING id`, [tenantA]);
        const c1 = await pool.query(`INSERT INTO customer (tenant_id, party_id) VALUES ($1, $2) RETURNING id`, [tenantA, p1.rows[0].id]);
        customerId = c1.rows[0].id;

        const ma = await pool.query(`INSERT INTO customer_account (tenant_id, customer_id, account_level, billing_responsible_flag) VALUES ($1, $2, 'MASTER', true) RETURNING id`, [tenantA, customerId]);
        masterAccountId = ma.rows[0].id;

        const ca = await pool.query(`INSERT INTO customer_account (tenant_id, customer_id, parent_account_id, account_level, billing_responsible_flag) VALUES ($1, $2, $3, 'CHILD', false) RETURNING id`, [tenantA, customerId, masterAccountId]);
        childAccountId = ca.rows[0].id;

        // Create Subscribers
        await pool.query(`INSERT INTO subscriber (tenant_id, subscriber_code, customer_account_id, service_category, service_mode) VALUES ($1, 'SUB-A', $2, 'GSM', 'PREPAID')`, [tenantA, masterAccountId]);
        await pool.query(`INSERT INTO subscriber (tenant_id, subscriber_code, customer_account_id, service_category, service_mode) VALUES ($1, 'SUB-B', $2, 'GSM', 'POSTPAID')`, [tenantA, masterAccountId]);
        await pool.query(`INSERT INTO subscriber (tenant_id, subscriber_code, customer_account_id, service_category, service_mode) VALUES ($1, 'SUB-C', $2, 'M2M', 'POSTPAID')`, [tenantA, childAccountId]);
    });

    afterAll(async () => {
        await pool.end();
    });

    beforeEach(() => {
        mockCatalogue.shouldFail = false;
        mockCatalogue.emptyResults = false;
    });

    test('Customer 360: Aggregate Customer, Accounts, Hierarchy, and Subscribers', async () => {
        const response = await getCustomer360.execute(tenantA, customerId);

        expect(response.customer.status).toBe('SUCCESS');
        expect(response.customer.data.id).toBe(customerId);

        // Accounts
        expect(response.accounts.status).toBe('SUCCESS');
        expect(response.accounts.data.length).toBe(2);

        // Map accounts for easier testing
        const accMap = new Map(response.accounts.data.map(a => [a.id, a]));
        const master = accMap.get(masterAccountId)!;
        const child = accMap.get(childAccountId)!;

        // Master Verification
        expect(master.accountType).toBe('MASTER');
        expect(master.billingAccountId).toBe(masterAccountId);
        expect(master.subscribers.length).toBe(2);
        expect(master.subscribers.some(s => s.subscriberCode === 'SUB-A')).toBe(true);

        // Child Verification
        expect(child.accountType).toBe('CHILD');
        expect(child.parentAccountId).toBe(masterAccountId);
        // Billing resolved to Master
        expect(child.billingAccountId).toBe(masterAccountId);
        expect(child.subscribers.length).toBe(1);
        expect(child.subscribers[0].subscriberCode).toBe('SUB-C');

        // Verify Contacts/Preferences are NOT_IMPLEMENTED as required
        expect(response.contacts.status).toBe('NOT_IMPLEMENTED');
    });

    test('Catalogue Unavailable: Graceful Degradation', async () => {
        mockCatalogue.shouldFail = true; // Simulate failure

        const response = await getCustomer360.execute(tenantA, customerId);

        // Overall request succeeds!
        expect(response.customer.status).toBe('SUCCESS');
        
        // Product Discovery clearly marked UNAVAILABLE
        expect(response.productDiscovery.status).toBe('UNAVAILABLE');
        expect(response.productDiscovery.data?.status).toBe(CatalogueDiscoveryStatus.UNAVAILABLE);
    });

    test('Catalogue No Results: Distinct from Unavailable', async () => {
        mockCatalogue.emptyResults = true;

        const response = await getCustomer360.execute(tenantA, customerId);

        expect(response.productDiscovery.status).toBe('SUCCESS');
        expect(response.productDiscovery.data?.status).toBe(CatalogueDiscoveryStatus.NO_RESULTS);
        expect(response.productDiscovery.data?.offerings.length).toBe(0);
    });

    test('Tenant Isolation enforced', async () => {
        const wrongTenant = '22222222-2222-2222-2222-222222222222';
        await expect(getCustomer360.execute(wrongTenant, customerId)).rejects.toThrow(CustomerNotFoundError);
    });
});
