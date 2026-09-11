const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'crm_db',
    password: 'admin',
    port: 5433,
});

async function runSeed() {
    try {
        const tenantId = '00000000-0000-0000-0000-000000000001';
        const parties = [
            { id: '33333333-3333-3333-3333-333333333333', type: 'INDIVIDUAL' },
            { id: '44444444-4444-4444-4444-444444444444', type: 'ORGANIZATION' },
            { id: '55555555-5555-5555-5555-555555555555', type: 'INDIVIDUAL' },
            { id: '66666666-6666-6666-6666-666666666666', type: 'ORGANIZATION' }
        ];

        for (const p of parties) {
            await pool.query(
                `INSERT INTO party (id, tenant_id, party_type, created_at, updated_at) 
                 VALUES ($1, $2, $3, NOW(), NOW()) 
                 ON CONFLICT (tenant_id, id) DO NOTHING`,
                [p.id, tenantId, p.type]
            );
        }
        console.log('Dummy parties inserted into CRM DB.');
    } catch (e) {
        console.error('Error seeding parties:', e);
    } finally {
        await pool.end();
    }
}

runSeed();
