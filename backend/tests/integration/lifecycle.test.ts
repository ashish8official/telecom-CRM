import { Pool } from 'pg';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository';
import { PostgresCustomerAccountRepository } from '../../infrastructure/repositories/PostgresCustomerAccountRepository';
import { PostgresSubscriberRepository } from '../../infrastructure/repositories/PostgresSubscriberRepository';
import { PostgresTransactionManager } from '../../infrastructure/database/TransactionManager';
import { PostgresIdempotencyManager } from '../../infrastructure/idempotency/PostgresIdempotencyManager';
import { ChangeCustomerStatus } from '../../application/customer/ChangeCustomerStatus';
import { ChangeCustomerAccountStatus } from '../../application/customer_account/ChangeCustomerAccountStatus';
import { ChangeSubscriberStatus } from '../../application/subscriber/ChangeSubscriberStatus';
import { CustomerStatus } from '../../domain/customer/CustomerTypes';
import { AccountStatus, AccountLevel } from '../../domain/customer_account/CustomerAccountTypes';
import { SubscriberStatus } from '../../domain/subscriber/SubscriberTypes';
import { InvalidCustomerStateTransitionError } from '../../domain/customer/CustomerErrors';
import { InvalidAccountStateTransitionError } from '../../domain/customer_account/CustomerAccountErrors';
import { InvalidSubscriberStatusTransitionError } from '../../domain/subscriber/SubscriberErrors';
import * as crypto from 'crypto';

require('dotenv').config();
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

describe('Lifecycle & State Management Integration Tests', () => {
    let pool: Pool;
    let customerRepo: PostgresCustomerRepository;
    let accountRepo: PostgresCustomerAccountRepository;
    let subscriberRepo: PostgresSubscriberRepository;
    let txManager: PostgresTransactionManager;
    let idempotencyManager: PostgresIdempotencyManager;

    let changeCustomerStatus: ChangeCustomerStatus;
    let changeAccountStatus: ChangeCustomerAccountStatus;
    let changeSubscriberStatus: ChangeSubscriberStatus;

    const tenantA = '55555555-5555-5555-5555-555555555555';

    let customerId: string;
    let masterAccountId: string;
    let subscriberId: string;

    beforeAll(async () => {
        pool = new Pool({ connectionString });
        customerRepo = new PostgresCustomerRepository(pool);
        accountRepo = new PostgresCustomerAccountRepository(pool);
        subscriberRepo = new PostgresSubscriberRepository(pool);
        txManager = new PostgresTransactionManager(pool);
        idempotencyManager = new PostgresIdempotencyManager(pool);

        changeCustomerStatus = new ChangeCustomerStatus(customerRepo, txManager, idempotencyManager);
        changeAccountStatus = new ChangeCustomerAccountStatus(accountRepo, txManager, idempotencyManager);
        changeSubscriberStatus = new ChangeSubscriberStatus(subscriberRepo, txManager, idempotencyManager);

        // Cleanup DB
        await pool.query('DELETE FROM subscriber_status_history WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM customer_account_status_history WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM customer_status_history WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM subscriber WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM customer_account WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM customer WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM idempotency_record WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM party WHERE tenant_id = $1', [tenantA]);
        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'LC_TENANT', 'Lifecycle Tenant') ON CONFLICT DO NOTHING`, [tenantA]);

        // Create Master Data
        const p1 = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INDIVIDUAL') RETURNING id`, [tenantA]);
        const partyId = p1.rows[0].id;
        
        // Setup Customer
        const c = await customerRepo.createCustomer(tenantA, {
            partyId,
            status: CustomerStatus.ACTIVE
        });
        customerId = c.id;

        // Setup Account
        const a = await accountRepo.createAccount(tenantA, {
            customerId,
            parentAccountId: null,
            accountLevel: AccountLevel.MASTER,
            billingResponsibleFlag: true,
            effectiveFrom: new Date()
        });
        masterAccountId = a.id;

        // Setup Subscriber
        const s = await subscriberRepo.createSubscriber(tenantA, {
            subscriberCode: 'SUB-LC-01',
            customerAccountId: masterAccountId,
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID'
        });
        subscriberId = s.id;
    });

    afterAll(async () => {
        await pool.end();
    });

    // CUSTOMER LIFECYCLE
    test('Customer: Valid Transition (ACTIVE -> SUSPENDED)', async () => {
        const custBefore = await customerRepo.getCustomerById(tenantA, customerId);
        expect(custBefore!.status).toBe(CustomerStatus.ACTIVE);
        
        const custAfter = await changeCustomerStatus.execute(tenantA, customerId, {
            newStatus: CustomerStatus.SUSPENDED,
            reasonCode: 'CUST_REQ',
            version: custBefore!.version
        });

        expect(custAfter.status).toBe(CustomerStatus.SUSPENDED);
        expect(custAfter.version).toBe(custBefore!.version + 1);

        // Verify Audit
        const audit = await pool.query(`SELECT * FROM customer_status_history WHERE customer_id = $1 ORDER BY changed_at DESC LIMIT 1`, [customerId]);
        expect(audit.rows[0].new_status).toBe(CustomerStatus.SUSPENDED);
        expect(audit.rows[0].previous_status).toBe(CustomerStatus.ACTIVE);
    });

    test('Customer: Invalid Transition (SUSPENDED -> INACTIVE)', async () => {
        const custBefore = await customerRepo.getCustomerById(tenantA, customerId);
        expect(custBefore!.status).toBe(CustomerStatus.SUSPENDED);
        
        await expect(changeCustomerStatus.execute(tenantA, customerId, {
            newStatus: CustomerStatus.INACTIVE,
            reasonCode: 'TEST',
            version: custBefore!.version
        })).rejects.toThrow(InvalidCustomerStateTransitionError);
    });

    test('Customer: Idempotency support (Same request twice)', async () => {
        const custBefore = await customerRepo.getCustomerById(tenantA, customerId);
        
        const idempotencyKey = crypto.randomUUID();
        const input = {
            newStatus: CustomerStatus.ACTIVE,
            reasonCode: 'REACTIVATE',
            version: custBefore!.version
        };

        // First call
        const custAfter1 = await changeCustomerStatus.execute(tenantA, customerId, input, idempotencyKey);
        expect(custAfter1.status).toBe(CustomerStatus.ACTIVE);
        
        // Second call (should return same result without error or version increment)
        const custAfter2 = await changeCustomerStatus.execute(tenantA, customerId, input, idempotencyKey);
        expect(custAfter2.version).toBe(custAfter1.version); // No actual update happened

        // Only one audit record should exist for this transition
        const audit = await pool.query(`SELECT * FROM customer_status_history WHERE customer_id = $1 AND new_status = 'ACTIVE'`, [customerId]);
        expect(audit.rowCount).toBe(1);
    });

    // ACCOUNT LIFECYCLE
    test('Account: Valid Transition (ACTIVE -> SUSPENDED)', async () => {
        const accBefore = await accountRepo.findAccountById(tenantA, masterAccountId);
        
        const accAfter = await changeAccountStatus.execute(tenantA, masterAccountId, {
            newStatus: AccountStatus.SUSPENDED,
            reasonCode: 'PAYMENT_FAIL',
            version: accBefore!.version
        });

        expect(accAfter.status).toBe(AccountStatus.SUSPENDED);
        
        const audit = await pool.query(`SELECT * FROM customer_account_status_history WHERE customer_account_id = $1`, [masterAccountId]);
        expect(audit.rowCount).toBe(1);
        expect(audit.rows[0].new_status).toBe(AccountStatus.SUSPENDED);
    });

    test('Account: Invalid Transition', async () => {
        const accBefore = await accountRepo.findAccountById(tenantA, masterAccountId);
        // It's currently SUSPENDED. We try to go to CLOSED (which IS valid), so let's try SUSPENDED -> SUSPENDED (invalid)
        
        await expect(changeAccountStatus.execute(tenantA, masterAccountId, {
            newStatus: AccountStatus.SUSPENDED,
            reasonCode: 'TEST',
            version: accBefore!.version
        })).rejects.toThrow(InvalidAccountStateTransitionError);
    });

    // SUBSCRIBER LIFECYCLE
    test('Subscriber: Valid Transition (PENDING -> ACTIVE)', async () => {
        const subBefore = await subscriberRepo.getSubscriber(tenantA, subscriberId);
        
        const subAfter = await changeSubscriberStatus.execute(tenantA, subscriberId, {
            newStatus: SubscriberStatus.ACTIVE,
            reasonCode: 'ACTIVATED',
            version: subBefore!.version
        });

        expect(subAfter.status).toBe(SubscriberStatus.ACTIVE);
    });
});
