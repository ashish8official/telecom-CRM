import { Pool } from 'pg';
import { PostgresCustomerAccountRepository } from '../../infrastructure/repositories/PostgresCustomerAccountRepository';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository';
import { PostgresTransactionManager } from '../../infrastructure/database/TransactionManager';
import { CreateMasterAccount } from '../../application/customer_account/CreateMasterAccount';
import { CreateChildAccount } from '../../application/customer_account/CreateChildAccount';
import { AccountStatus } from '../../domain/customer_account/CustomerAccountTypes';
import { CrossCustomerAccountHierarchyError } from '../../domain/customer_account/CustomerAccountErrors';

require('dotenv').config();
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

describe('Customer Account Database Integration Tests', () => {
    let pool: Pool;
    let accountRepo: PostgresCustomerAccountRepository;
    let customerRepo: PostgresCustomerRepository;
    let txManager: PostgresTransactionManager;
    let createMaster: CreateMasterAccount;
    let createChild: CreateChildAccount;

    const tenantA = '77777777-7777-7777-7777-777777777777';
    const tenantB = '88888888-8888-8888-8888-888888888888';
    let customerA_Id: string;
    let customerA2_Id: string;
    let customerB_Id: string;

    beforeAll(async () => {
        pool = new Pool({ connectionString });
        accountRepo = new PostgresCustomerAccountRepository(pool);
        customerRepo = new PostgresCustomerRepository(pool);
        txManager = new PostgresTransactionManager(pool);
        
        createMaster = new CreateMasterAccount(accountRepo, customerRepo, txManager);
        createChild = new CreateChildAccount(accountRepo, customerRepo, txManager);

        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'CA_A', 'CA Tenant A') ON CONFLICT DO NOTHING`, [tenantA]);
        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'CA_B', 'CA Tenant B') ON CONFLICT DO NOTHING`, [tenantB]);

        const pA = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INDIVIDUAL') RETURNING id`, [tenantA]);
        const cA = await pool.query(`INSERT INTO customer (tenant_id, party_id) VALUES ($1, $2) RETURNING id`, [tenantA, pA.rows[0].id]);
        customerA_Id = cA.rows[0].id;

        const pA2 = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INDIVIDUAL') RETURNING id`, [tenantA]);
        const cA2 = await pool.query(`INSERT INTO customer (tenant_id, party_id) VALUES ($1, $2) RETURNING id`, [tenantA, pA2.rows[0].id]);
        customerA2_Id = cA2.rows[0].id;

        const pB = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INDIVIDUAL') RETURNING id`, [tenantB]);
        const cB = await pool.query(`INSERT INTO customer (tenant_id, party_id) VALUES ($1, $2) RETURNING id`, [tenantB, pB.rows[0].id]);
        customerB_Id = cB.rows[0].id;
    });

    afterAll(async () => {
        await pool.end();
    });

    test('Master Creation and Billing Flag DB Constraint', async () => {
        const master = await createMaster.execute(tenantA, { customerId: customerA_Id });
        expect(master.billingResponsibleFlag).toBe(true);

        // Try direct DB insertion to violate constraint
        try {
            await pool.query(
                `INSERT INTO customer_account (tenant_id, customer_id, account_level, billing_responsible_flag) VALUES ($1, $2, 'MASTER', false)`, 
                [tenantA, customerA_Id]
            );
            throw new Error("Expected constraint violation");
        } catch (e: any) {
            expect(e.message).toContain('chk_ca_rules'); // Our check constraint
        }
    });

    test('Tenant Isolation - Cross Tenant FK Violation', async () => {
        const master = await createMaster.execute(tenantA, { customerId: customerA_Id });
        try {
            // Force inserting child into Tenant B pointing to Tenant A master
            await pool.query(
                `INSERT INTO customer_account (tenant_id, customer_id, parent_account_id, account_level, billing_responsible_flag) 
                 VALUES ($1, $2, $3, 'CHILD', false)`, 
                [tenantB, customerB_Id, master.id]
            );
            throw new Error("Expected cross-tenant FK violation");
        } catch (e: any) {
            expect(e.code).toBe('23503'); // foreign_key_violation
        }
    });

    test('Cross-Customer Hierarchy Rejection', async () => {
        const master = await createMaster.execute(tenantA, { customerId: customerA_Id });
        await expect(
            createChild.execute(tenantA, { customerId: customerA2_Id, parentAccountId: master.id })
        ).rejects.toThrow(CrossCustomerAccountHierarchyError);
    });

    test('Self-Parenting DB Check Violation', async () => {
        const master = await createMaster.execute(tenantA, { customerId: customerA_Id });
        try {
            // Force self-parenting
            await pool.query(`UPDATE customer_account SET parent_account_id = id WHERE id = $1`, [master.id]);
            throw new Error("Expected check violation");
        } catch (e: any) {
            expect(e.message).toContain('chk_ca_no_self_parent');
        }
    });
});
