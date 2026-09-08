const fs = require('fs');

let f = 'backend/tests/integration/subscriber_db.test.ts';
let t = fs.readFileSync(f, 'utf8');

if (!t.includes('PostgresIdempotencyManager')) {
    t = t.replace("import { CreateSubscriber } from '../../application/subscriber/CreateSubscriber';", 
        "import { CreateSubscriber } from '../../application/subscriber/CreateSubscriber';\nimport { PostgresIdempotencyManager } from '../../infrastructure/idempotency/PostgresIdempotencyManager';\nimport { IdempotencyKeyReusedWithDifferentRequestError } from '../../domain/common/idempotency/IdempotencyErrors';");

    t = t.replace("let createSubscriber: CreateSubscriber;", 
        "let createSubscriber: CreateSubscriber;\n    let idempotencyManager: PostgresIdempotencyManager;");

    t = t.replace("createSubscriber = new CreateSubscriber(subscriberRepo, accountRepo, txManager);", 
        "idempotencyManager = new PostgresIdempotencyManager(pool);\n        createSubscriber = new CreateSubscriber(subscriberRepo, accountRepo, txManager, idempotencyManager);");

    const oldIdempTest = /test\('Idempotency: Same key returns existing subscriber safely', async \(\) => \{[\s\S]*?\}\);/s;

    const newIdempTest = `test('Idempotency: Same key returns existing subscriber safely', async () => {
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
    });`;

    t = t.replace(oldIdempTest, newIdempTest);
}

fs.writeFileSync(f, t);
