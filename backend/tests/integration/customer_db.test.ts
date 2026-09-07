import { Pool } from 'pg';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository';
import { PostgresPartyRepository } from '../../infrastructure/repositories/PostgresPartyRepository';
import { PostgresTransactionManager } from '../../infrastructure/database/TransactionManager';
import { CreateCustomer } from '../../application/customer/CreateCustomer';
import { GetCustomer } from '../../application/customer/GetCustomer';
import { ChangeCustomerStatus } from '../../application/customer/ChangeCustomerStatus';
import { CustomerStatus } from '../../domain/customer/CustomerTypes';
import { CustomerAlreadyExistsError, CustomerNotFoundError } from '../../domain/customer/CustomerErrors';
import { PartyType } from '../../domain/party/PartyTypes';

require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

describe('Customer Database Integration Tests', () => {
    let pool: Pool;
    let customerRepo: PostgresCustomerRepository;
    let partyRepo: PostgresPartyRepository;
    let txManager: PostgresTransactionManager;
    let createCustomer: CreateCustomer;
    let getCustomer: GetCustomer;
    let changeStatus: ChangeCustomerStatus;

    const tenantA = '55555555-5555-5555-5555-555555555555';
    const tenantB = '66666666-6666-6666-6666-666666666666';
    let partyA_Id: string;
    let partyB_Id: string;

    beforeAll(async () => {
        pool = new Pool({ connectionString });
        customerRepo = new PostgresCustomerRepository(pool);
        partyRepo = new PostgresPartyRepository(pool);
        txManager = new PostgresTransactionManager(pool);
        
        createCustomer = new CreateCustomer(customerRepo, partyRepo, txManager);
        getCustomer = new GetCustomer(customerRepo);
        changeStatus = new ChangeCustomerStatus(customerRepo);

        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'CUST_A', 'Cust Tenant A') ON CONFLICT DO NOTHING`, [tenantA]);
        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'CUST_B', 'Cust Tenant B') ON CONFLICT DO NOTHING`, [tenantB]);

        const pA = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, $2) RETURNING id`, [tenantA, PartyType.INDIVIDUAL]);
        partyA_Id = pA.rows[0].id;

        const pB = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, $2) RETURNING id`, [tenantB, PartyType.INDIVIDUAL]);
        partyB_Id = pB.rows[0].id;
    });

    afterAll(async () => {
        await pool.end();
    });

    test('Composite Tenant FK Protection', async () => {
        // Attempt to create Customer in Tenant A referencing Party in Tenant B
        try {
            await pool.query(`
                INSERT INTO customer (tenant_id, party_id) VALUES ($1, $2)
            `, [tenantA, partyB_Id]);
            throw new Error("Expected cross-tenant FK violation");
        } catch (e: any) {
            expect(e.code).toBe('23503'); // foreign_key_violation
        }
    });

    test('Customer Creation and Tenant Isolation', async () => {
        const cust = await createCustomer.execute(tenantA, { partyId: partyA_Id });
        expect(cust.id).toBeDefined();
        expect(cust.partyId).toBe(partyA_Id);
        
        // Tenant Isolation
        await expect(getCustomer.execute(tenantB, cust.id)).rejects.toThrow(CustomerNotFoundError);
    });

    test('Duplicate Customer Rule (Max 1 Active)', async () => {
        // First one is created in previous test, so trying again should throw
        await expect(createCustomer.execute(tenantA, { partyId: partyA_Id })).rejects.toThrow(CustomerAlreadyExistsError);
    });

    test('Transaction Safety', async () => {
        // Force failure by passing null partyId (which will be caught by validation or DB)
        await expect(createCustomer.execute(tenantA, { partyId: '' })).rejects.toThrow();
        // The transaction rollback should be handled cleanly
    });

    test('Customer Termination', async () => {
        // Create fresh party and customer
        const pTerm = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, $2) RETURNING id`, [tenantA, PartyType.ORGANIZATION]);
        const cust = await createCustomer.execute(tenantA, { partyId: pTerm.rows[0].id });
        
        // Terminate
        await changeStatus.execute(tenantA, cust.id, CustomerStatus.TERMINATED);
        
        // Verify Party remains
        const checkP = await pool.query(`SELECT id FROM party WHERE id = $1`, [pTerm.rows[0].id]);
        expect(checkP.rowCount).toBe(1);

        // Verify Customer remains historically
        const checkC = await pool.query(`SELECT status FROM customer WHERE id = $1`, [cust.id]);
        expect(checkC.rowCount).toBe(1);
        expect(checkC.rows[0].status).toBe('TERMINATED');

        // Verify we can now create a NEW customer for the same party, since the previous is TERMINATED (not Active/Suspended)
        const newCust = await createCustomer.execute(tenantA, { partyId: pTerm.rows[0].id });
        expect(newCust.id).not.toBe(cust.id);
        expect(newCust.status).toBe('ACTIVE');
    });
});
