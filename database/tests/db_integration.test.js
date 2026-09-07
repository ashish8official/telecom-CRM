const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

async function runTests() {
    const client = new Client({ connectionString });
    try {
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
            await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_A', 'Tenant A')`, [tA]);
            await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_B', 'Tenant B')`, [tB]);
            await client.query(`INSERT INTO party (id, tenant_id, party_type) VALUES ($1, $2, 'INDIVIDUAL')`, [pA, tA]);
            
            try {
                await client.query(`
                    INSERT INTO individual (tenant_id, party_id, first_name, last_name)
                    VALUES ($1, $2, 'Test', 'Cross')
                `, [tB, pA]);
                throw new Error("Expected FOREIGN KEY VIOLATION, but insert succeeded");
            } catch (e) {
                if (e.code !== '23503') { // 23503 = foreign_key_violation
                    throw new Error(`Expected SQLSTATE 23503 (foreign_key_violation), got ${e.code}: ${e.message}`);
                }
            }
        });

        await test("Test B - Party type validation (CHECK CONSTRAINT VIOLATION)", async () => {
            await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_C', 'Tenant C')`, [tA]);
            try {
                await client.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, 'INVALID_TYPE')`, [tA]);
                throw new Error("Expected CHECK CONSTRAINT VIOLATION");
            } catch (e) {
                if (e.code !== '23514') { // 23514 = check_violation
                    throw new Error(`Expected SQLSTATE 23514 (check_violation), got ${e.code}: ${e.message}`);
                }
                if (e.constraint !== 'chk_party_type') {
                    throw new Error(`Expected constraint chk_party_type, got ${e.constraint}`);
                }
            }
        });

        await test("Test C - Tenant uniqueness (UNIQUE CONSTRAINT VIOLATION)", async () => {
            await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'DUP_CODE', 'Tenant 1')`, [tA]);
            try {
                await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'DUP_CODE', 'Tenant 2')`, [tB]);
                throw new Error("Expected UNIQUE CONSTRAINT VIOLATION");
            } catch (e) {
                if (e.code !== '23505') { // 23505 = unique_violation
                    throw new Error(`Expected SQLSTATE 23505 (unique_violation), got ${e.code}: ${e.message}`);
                }
                if (e.constraint !== 'tenant_tenant_code_key') {
                    throw new Error(`Expected constraint tenant_tenant_code_key, got ${e.constraint}`);
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
                if (e.code !== '23505') { // 23505 = unique_violation
                    throw new Error(`Expected SQLSTATE 23505 (unique_violation), got ${e.code}: ${e.message}`);
                }
                if (e.constraint !== 'uq_individual_party') {
                    throw new Error(`Expected constraint uq_individual_party, got ${e.constraint}`);
                }
            }
        });

        await test("Test E - Soft delete behavior", async () => {
            await client.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ($1, 'T_E', 'Tenant E')`, [tA]);
            await client.query(`INSERT INTO party (id, tenant_id, party_type) VALUES ($1, $2, 'INDIVIDUAL')`, [pA, tA]);
            
            await client.query(`UPDATE party SET deleted_at = NOW() WHERE id = $1`, [pA]);
            
            const { rows } = await client.query(`SELECT deleted_at FROM party WHERE id = $1`, [pA]);
            if (rows.length === 0 || rows[0].deleted_at === null) {
                throw new Error("deleted_at not populated");
            }
            
            const activeRows = await client.query(`SELECT id FROM party WHERE deleted_at IS NULL AND id = $1`, [pA]);
            if (activeRows.rowCount > 0) {
                throw new Error("Row returned in active query despite being soft deleted");
            }
        });

        console.log(`\nTests Completed. Passed: ${passed}, Failed: ${failed}`);
        if (failed > 0) process.exitCode = 1;
    } catch (err) {
        console.error("Test runner failed:", err.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    runTests().catch(err => {
        console.error("Unhandled error during tests:", err);
        process.exitCode = 1;
    });
}

module.exports = { runTests };
