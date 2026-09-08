import { Pool } from 'pg';
import { PostgresSubscriberRepository } from '../../infrastructure/repositories/PostgresSubscriberRepository';
import { PostgresCustomerAccountRepository } from '../../infrastructure/repositories/PostgresCustomerAccountRepository';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository';
import { PostgresTransactionManager } from '../../infrastructure/database/TransactionManager';
import { CreateSubscriber } from '../../application/subscriber/CreateSubscriber';
import { PostgresIdempotencyManager } from '../../infrastructure/idempotency/PostgresIdempotencyManager';
import { IdempotencyKeyReusedWithDifferentRequestError } from '../../domain/common/idempotency/IdempotencyErrors';
import { ChangeSubscriberStatus } from '../../application/subscriber/ChangeSubscriberStatus';
import { ResolveSubscriberBillingAccount } from '../../application/subscriber/ResolveSubscriberBillingAccount';
import { SubscriberStatus } from '../../domain/subscriber/SubscriberTypes';
import { DuplicateSubscriberError, ConcurrentModificationError, InvalidSubscriberStatusTransitionError } from '../../domain/subscriber/SubscriberErrors';

require('dotenv').config();
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

describe('Subscriber Database Integration Tests', () => {
    let pool: Pool;
    let subscriberRepo: PostgresSubscriberRepository;
    let accountRepo: PostgresCustomerAccountRepository;
    let customerRepo: PostgresCustomerRepository;
    let txManager: PostgresTransactionManager;
    let createSubscriber: CreateSubscriber;
    let idempotencyManager: PostgresIdempotencyManager;
    let changeStatus: ChangeSubscriberStatus;
    let resolveBilling: ResolveSubscriberBillingAccount;

    const tenantA = '99999999-9999-9999-9999-999999999999';
    let masterA_Id: string;
    let masterB_Id: string;
    let childB_Id: string;

    beforeAll(async () => {
        pool = new Pool({ connectionString });
        subscriberRepo = new PostgresSubscriberRepository(pool);
        accountRepo = new PostgresCustomerAccountRepository(pool);
        customerRepo = new PostgresCustomerRepository(pool);
        txManager = new PostgresTransactionManager(pool);
        
        idempotencyManager = new PostgresIdempotencyManager(pool);
        createSubscriber = new CreateSubscriber(subscriberRepo, accountRepo, txManager, idempotencyManager);
        changeStatus = new ChangeSubscriberStatus(subscriberRepo, txManager);
        resolveBilling = new ResolveSubscriberBillingAccount(subscriberRepo, accountRepo);

        await pool.query('DELETE FROM subscriber_status_history WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM subscriber WHERE tenant_id = $1', [tenantA]);
        await pool.query('DELETE FROM idempotency_record WHERE tenant_id = $1', [tenantA]);
        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'SUB_A', 'Sub Tenant A') ON CONFLICT DO NOTHING`, [tenantA]);

        // Create Party & Customer
        const p1 = await pool.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INDIVIDUAL') RETURNING id`, [tenantA]);
        const c1 = await pool.query(`INSERT INTO customer (tenant_id, party_id) VALUES ($1, $2) RETURNING id`, [tenantA, p1.rows[0].id]);
        
        // Scenario A Master Account
        const ma1 = await pool.query(`INSERT INTO customer_account (tenant_id, customer_id, account_level, billing_responsible_flag) VALUES ($1, $2, 'MASTER', true) RETURNING id`, [tenantA, c1.rows[0].id]);
        masterA_Id = ma1.rows[0].id;

        // Scenario B/C Master Account and Child Account
        const ma2 = await pool.query(`INSERT INTO customer_account (tenant_id, customer_id, account_level, billing_responsible_flag) VALUES ($1, $2, 'MASTER', true) RETURNING id`, [tenantA, c1.rows[0].id]);
        masterB_Id = ma2.rows[0].id;

        const ca1 = await pool.query(`INSERT INTO customer_account (tenant_id, customer_id, parent_account_id, account_level, billing_responsible_flag) VALUES ($1, $2, $3, 'CHILD', false) RETURNING id`, [tenantA, c1.rows[0].id, masterB_Id]);
        childB_Id = ca1.rows[0].id;
    });

    afterAll(async () => {
        await pool.end();
    });

    test('Scenario A: One Master Account -> One Subscriber', async () => {
        const sub = await createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id,
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID'
        });

        expect(sub.id).toBeDefined();
        expect(sub.status).toBe(SubscriberStatus.PENDING);
        
        const billingAcc = await resolveBilling.execute(tenantA, sub.id);
        expect(billingAcc.id).toBe(masterA_Id);
    });

    test('Scenario B: One Master Account -> Multiple Subscribers', async () => {
        const sub1 = await createSubscriber.execute(tenantA, {
            customerAccountId: masterB_Id,
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID'
        });

        const sub2 = await createSubscriber.execute(tenantA, {
            customerAccountId: masterB_Id,
            serviceCategory: 'GSM',
            serviceMode: 'POSTPAID'
        });

        const bill1 = await resolveBilling.execute(tenantA, sub1.id);
        const bill2 = await resolveBilling.execute(tenantA, sub2.id);

        expect(bill1.id).toBe(masterB_Id);
        expect(bill2.id).toBe(masterB_Id);
    });

    test('Scenario C: Hierarchical Account (Child Account -> Subscriber)', async () => {
        const sub = await createSubscriber.execute(tenantA, {
            customerAccountId: childB_Id,
            serviceCategory: 'M2M',
            serviceMode: 'POSTPAID'
        });

        expect(sub.customerAccountId).toBe(childB_Id);

        const billingAcc = await resolveBilling.execute(tenantA, sub.id);
        expect(billingAcc.id).toBe(masterB_Id);
    });

    test('Idempotency: Same key returns existing subscriber safely', async () => {
        const sub1 = await createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id,
            serviceCategory: 'FWA',
            serviceMode: 'POSTPAID'
        }, 'idem-key-123');

        const sub2 = await createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id,
            serviceCategory: 'FWA',
            serviceMode: 'POSTPAID'
        }, 'idem-key-123');

        expect(sub1.id).toBe(sub2.id);
        expect(sub1.subscriberCode).toBeDefined();
    });

    test('Idempotency: Different request payload throws error', async () => {
        await expect(createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id,
            serviceCategory: 'GSM', 
            serviceMode: 'PREPAID'
        }, 'idem-key-123')).rejects.toThrow(IdempotencyKeyReusedWithDifferentRequestError);
    });

    test('Duplicate Subscriber Code rejects', async () => {
        await createSubscriber.execute(tenantA, {
            subscriberCode: 'SUB-DUP',
            customerAccountId: masterA_Id,
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID'
        });

        await expect(createSubscriber.execute(tenantA, {
            subscriberCode: 'SUB-DUP',
            customerAccountId: masterA_Id,
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID'
        })).rejects.toThrow(DuplicateSubscriberError);
    });

    test('Lifecycle Transitions and Atomic History', async () => {
        const sub = await createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id,
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID'
        });

        const activeSub = await changeStatus.execute(tenantA, sub.id, {
            newStatus: SubscriberStatus.ACTIVE,
            reasonCode: 'ACTIVATION_SUCCESS',
            version: sub.version
        });

        expect(activeSub.status).toBe(SubscriberStatus.ACTIVE);
        expect(activeSub.version).toBe(2);

        const historyCheck = await pool.query(`SELECT * FROM subscriber_status_history WHERE subscriber_id = $1 ORDER BY changed_at DESC LIMIT 1`, [sub.id]);
        expect(historyCheck.rows[0].new_status).toBe('ACTIVE');
        expect(historyCheck.rows[0].previous_status).toBe('PENDING');

        await expect(changeStatus.execute(tenantA, sub.id, {
            newStatus: SubscriberStatus.TERMINATED,
            reasonCode: 'WRONG',
            version: activeSub.version
        })).rejects.toThrow(InvalidSubscriberStatusTransitionError);
    });

    test('Concurrency (Optimistic Locking) Prevention', async () => {
        const sub = await createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id,
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID'
        });

        await changeStatus.execute(tenantA, sub.id, {
            newStatus: SubscriberStatus.ACTIVE,
            reasonCode: 'OK',
            version: sub.version
        });

        await expect(changeStatus.execute(tenantA, sub.id, {
            newStatus: SubscriberStatus.DISCONNECTED,
            reasonCode: 'CONFLICT',
            version: sub.version // stale version!
        })).rejects.toThrow(ConcurrentModificationError);
    });
});
