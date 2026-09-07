const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

async function seed() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        await client.query('BEGIN');

        console.log("Seeding Demo Tenant...");
        const tenantId = '00000000-0000-0000-0000-000000000001';
        await client.query(`
            INSERT INTO tenant (id, tenant_code, name, status) 
            VALUES ($1, 'DEMO_TELCO', 'Demo Telecom Inc', 'ACTIVE')
            ON CONFLICT (tenant_code) DO NOTHING;
        `, [tenantId]);

        console.log("Seeding Individual Party (John Doe)...");
        const partyIndId = '11111111-1111-1111-1111-111111111111';
        await client.query(`
            INSERT INTO party (id, tenant_id, party_type, status)
            VALUES ($1, $2, 'INDIVIDUAL', 'ACTIVE')
            ON CONFLICT DO NOTHING;
        `, [partyIndId, tenantId]);

        await client.query(`
            INSERT INTO individual (id, tenant_id, party_id, first_name, last_name)
            VALUES (uuid_generate_v4(), $1, $2, 'John', 'Doe')
            ON CONFLICT (tenant_id, party_id) DO NOTHING;
        `, [tenantId, partyIndId]);

        console.log("Seeding Organization Party (Demo Enterprises Ltd.)...");
        const partyOrgId = '22222222-2222-2222-2222-222222222222';
        await client.query(`
            INSERT INTO party (id, tenant_id, party_type, status)
            VALUES ($1, $2, 'ORGANIZATION', 'ACTIVE')
            ON CONFLICT DO NOTHING;
        `, [partyOrgId, tenantId]);

        await client.query(`
            INSERT INTO organization (id, tenant_id, party_id, legal_name)
            VALUES (uuid_generate_v4(), $1, $2, 'Demo Enterprises Ltd.')
            ON CONFLICT (tenant_id, party_id) DO NOTHING;
        `, [tenantId, partyOrgId]);

        await client.query('COMMIT');
        console.log("Seeding completed successfully.");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error during seeding:", err.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    seed().catch(err => {
        console.error("Unhandled error during seeding:", err);
        process.exitCode = 1;
    });
}

module.exports = { seed };
