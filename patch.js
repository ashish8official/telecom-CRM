const fs = require('fs');
let f = 'backend/tests/integration/subscriber_db.test.ts';
let t = fs.readFileSync(f, 'utf8');

t = t.replace("import { CreateSubscriber } from '../../application/subscriber/CreateSubscriber';", "import { CreateSubscriber } from '../../application/subscriber/CreateSubscriber';\nimport { PostgresIdempotencyManager } from '../../infrastructure/idempotency/PostgresIdempotencyManager';\nimport { IdempotencyKeyReusedWithDifferentRequestError } from '../../domain/common/idempotency/IdempotencyErrors';");

t = t.replace("let createSubscriber: CreateSubscriber;", "let createSubscriber: CreateSubscriber;\n    let idempotencyManager: PostgresIdempotencyManager;");

t = t.replace("createSubscriber = new CreateSubscriber(subscriberRepo, accountRepo, txManager);", "idempotencyManager = new PostgresIdempotencyManager(pool);\n        createSubscriber = new CreateSubscriber(subscriberRepo, accountRepo, txManager, idempotencyManager);\n\n        await pool.query('DELETE FROM subscriber_status_history WHERE tenant_id = $1', [tenantA]);\n        await pool.query('DELETE FROM subscriber WHERE tenant_id = $1', [tenantA]);\n        await pool.query('DELETE FROM idempotency_record WHERE tenant_id = $1', [tenantA]);");

// Replace idempotency key in normal create calls
t = t.replace(/idempotencyKey: 'idem-key-123'\n/g, "");

// Modify the specific test:
const oldTestStr = `    test('Idempotency: Same key returns existing subscriber safely', async () => {
        const sub1 = await createSubscriber.execute(tenantA, {
            subscriberCode: 'SUB-IDEM-1',
            customerAccountId: masterA_Id,
            serviceCategory: 'FWA',
            serviceMode: 'POSTPAID',
            idempotencyKey: 'idem-key-123'
        });

        const sub2 = await createSubscriber.execute(tenantA, {
            subscriberCode: 'SUB-IDEM-2', // Diff code
            customerAccountId: masterB_Id, // Diff account
            serviceCategory: 'GSM',
            serviceMode: 'PREPAID',
            idempotencyKey: 'idem-key-123' // Same key!
        });

        expect(sub1.id).toBe(sub2.id);
        expect(sub1.subscriberCode).toBe('SUB-IDEM-1');
    });`;

const newTestStr = `    test('Idempotency: Same key returns existing subscriber safely', async () => {
        const sub1 = await createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id,
            serviceCategory: 'FWA',
            serviceMode: 'POSTPAID'
        }, 'idem-key-123');

        const sub2 = await createSubscriber.execute(tenantA, {
            customerAccountId: masterA_Id, // Hash must match!
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
    });`;

t = t.replace(oldTestStr, newTestStr);

// Clean up remaining occurrences of `idempotencyKey` inside object
t = t.replace(/,\s*idempotencyKey: 'idem-key-123'/g, "");

fs.writeFileSync(f, t);
