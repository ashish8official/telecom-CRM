const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

async function runTests() {
    const client = new Client({ connectionString });
    await client.connect();

    console.log("Running Database Integration Tests...");
    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await client.query('BEGIN');
            await fn();
            await client.query('ROLLBACK');
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`[FAIL] ${name}\n       ${err.message}`);
            failed++;
        }
    }

    // Helper setup for tests
    const tA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const pA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    await test("Test A - Tenant isolation (Cross-tenant FK violation)", async () => {
        // Setup Tenant A and B
        await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_A', 'Tenant A')`, [tA]);
        await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_B', 'Tenant B')`, [tB]);
        // Setup Party in Tenant A
        await client.query(`INSERT INTO party (id, tenant_id, party_type) VALUES ($1, $2, 'INDIVIDUAL')`, [pA, tA]);
        
        // Try inserting Individual extension into Tenant B but referencing Party in Tenant A
        try {
            await client.query(`
                INSERT INTO individual (tenant_id, party_id, first_name, last_name)
                VALUES ($1, $2, 'Test', 'Cross')
            `, [tB, pA]);
            throw new Error("Expected FOREIGN KEY VIOLATION, but insert succeeded");
        } catch (e) {
            if (!e.message.includes('foreign key constraint') && !e.message.includes('violates foreign key')) {
                throw e;
            }
        }
    });

    await test("Test B - Party type validation (CHECK CONSTRAINT VIOLATION)", async () => {
        await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_C', 'Tenant C')`, [tA]);
        try {
            await client.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INVALID_TYPE')`, [tA]);
            throw new Error("Expected CHECK CONSTRAINT VIOLATION");
        } catch (e) {
            if (!e.message.includes('violates check constraint "chk_party_type"')) {
                throw e;
            }
        }
    });

    await test("Test C - Tenant uniqueness (UNIQUE CONSTRAINT VIOLATION)", async () => {
        await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'DUP_CODE', 'Tenant 1')`, [tA]);
        try {
            await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'DUP_CODE', 'Tenant 2')`, [tB]);
            throw new Error("Expected UNIQUE CONSTRAINT VIOLATION");
        } catch (e) {
            if (!e.message.includes('unique constraint "tenant_tenant_code_key"')) {
                throw e;
            }
        }
    });

    await test("Test D - 1:1 subtype relationship (UNIQUE CONSTRAINT VIOLATION)", async () => {
        await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_D', 'Tenant D')`, [tA]);
        await client.query(`INSERT INTO party (id, tenant_id, party_type) VALUES ($1, $2, 'INDIVIDUAL')`, [pA, tA]);
        
        await client.query(`
            INSERT INTO individual (tenant_id, party_id, first_name, last_name)
            VALUES ($1, $2, 'First', 'Record')
        `, [tA, pA]);

        try {
            await client.query(`
                INSERT INTO individual (tenant_id, party_id, first_name, last_name)
                VALUES ($1, $2, 'Second', 'Record')
            `, [tA, pA]);
            throw new Error("Expected UNIQUE CONSTRAINT VIOLATION");
        } catch (e) {
            if (!e.message.includes('unique constraint "uq_individual_party"')) {
                throw e;
            }
        }
    });

    await test("Test E - Soft delete behavior", async () => {
        await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_E', 'Tenant E')`, [tA]);
        await client.query(`INSERT INTO party (id, tenant_id, party_type) VALUES ($1, $2, 'INDIVIDUAL')`, [pA, tA]);
        
        // Soft delete
        await client.query(`UPDATE party SET deleted_at = NOW() WHERE id = $1`, [pA]);
        
        // Verify row remains but deleted_at is populated
        const { rows } = await client.query(`SELECT deleted_at FROM party WHERE id = $1`, [pA]);
        if (rows.length === 0 || rows[0].deleted_at === null) {
            throw new Error("deleted_at not populated");
        }
        
        // Simulate active query
        const activeRows = await client.query(`SELECT id FROM party WHERE deleted_at IS NULL AND id = $1`, [pA]);
        if (activeRows.rowCount > 0) {
            throw new Error("Row returned in active query despite being soft deleted");
        }
    });

    console.log(`\nTests Completed. Passed: ${passed}, Failed: ${failed}`);
    await client.end();
    if (failed > 0) process.exit(1);
}

if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests };
