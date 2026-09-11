const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'crm_db',
    password: 'admin',
    port: 5433,
});

async function resetAndSeed() {
    const T = '00000000-0000-0000-0000-000000000001';
    const client = await pool.connect();
    
    try {
        // Get all tables
        const tablesRes = await client.query(`
            SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'schema_migrations'
        `);
        const tableNames = tablesRes.rows.map(r => r.tablename);
        
        console.log('TRUNCATING all tables...');
        await client.query(`TRUNCATE TABLE ${tableNames.join(', ')} CASCADE`);

        // Tenant
        await client.query(
            `INSERT INTO tenant (id, tenant_code, name, status, created_at, updated_at) 
             VALUES ($1, 'DEMO_TELCO', 'Demo Telecom Inc', 'ACTIVE', NOW(), NOW())`, [T]
        );

        // ===================== PARTIES =====================
        const parties = [
            { id: '11111111-1111-1111-1111-111111111111', type: 'INDIVIDUAL' },
            { id: '22222222-2222-2222-2222-222222222222', type: 'ORGANIZATION' },
            { id: '33333333-3333-3333-3333-333333333333', type: 'INDIVIDUAL' },
            { id: '44444444-4444-4444-4444-444444444444', type: 'ORGANIZATION' },
            { id: '55555555-5555-5555-5555-555555555555', type: 'INDIVIDUAL' },
            { id: '66666666-6666-6666-6666-666666666666', type: 'ORGANIZATION' }
        ];
        for (const p of parties) {
            await client.query(
                `INSERT INTO party (id, tenant_id, party_type, status, created_at, updated_at)
                 VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW())`, [p.id, T, p.type]
            );
        }

        // Individuals
        const individuals = [
            { partyId: '11111111-1111-1111-1111-111111111111', first: 'Rajesh', last: 'Sharma' },
            { partyId: '33333333-3333-3333-3333-333333333333', first: 'Priya',  last: 'Patel' },
            { partyId: '55555555-5555-5555-5555-555555555555', first: 'Amit',   last: 'Verma' }
        ];
        for (const i of individuals) {
            await client.query(
                `INSERT INTO individual (id, tenant_id, party_id, first_name, last_name, created_at, updated_at)
                 VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW(), NOW())`, [T, i.partyId, i.first, i.last]
            );
        }

        // Organizations
        const orgs = [
            { partyId: '22222222-2222-2222-2222-222222222222', name: 'Reliance Digital Services' },
            { partyId: '44444444-4444-4444-4444-444444444444', name: 'TechCorp Solutions Pvt. Ltd.' },
            { partyId: '66666666-6666-6666-6666-666666666666', name: 'CloudNet Enterprises' }
        ];
        for (const o of orgs) {
            await client.query(
                `INSERT INTO organization (id, tenant_id, party_id, legal_name, created_at, updated_at)
                 VALUES (uuid_generate_v4(), $1, $2, $3, NOW(), NOW())`, [T, o.partyId, o.name]
            );
        }
        console.log('6 parties seeded.');

        // ===================== CUSTOMERS =====================
        const customers = [
            { id: 'c0000001-0000-4000-a000-000000000001', partyId: '11111111-1111-1111-1111-111111111111', cat: 'CONSUMER',    seg: 'GOLD',     status: 'ACTIVE' },
            { id: 'c0000002-0000-4000-a000-000000000002', partyId: '22222222-2222-2222-2222-222222222222', cat: 'ENTERPRISE',  seg: 'PLATINUM', status: 'ACTIVE' },
            { id: 'c0000003-0000-4000-a000-000000000003', partyId: '33333333-3333-3333-3333-333333333333', cat: 'CONSUMER',    seg: 'SILVER',   status: 'ACTIVE' },
            { id: 'c0000004-0000-4000-a000-000000000004', partyId: '44444444-4444-4444-4444-444444444444', cat: 'ENTERPRISE',  seg: 'GOLD',     status: 'SUSPENDED' },
            { id: 'c0000005-0000-4000-a000-000000000005', partyId: '55555555-5555-5555-5555-555555555555', cat: 'CONSUMER',    seg: 'STANDARD', status: 'ACTIVE' }
        ];
        for (const c of customers) {
            const ver = c.status === 'SUSPENDED' ? 2 : 1;
            await client.query(
                `INSERT INTO customer (id, tenant_id, party_id, status, customer_category, customer_segment, version, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                [c.id, T, c.partyId, c.status, c.cat, c.seg, ver]
            );
        }
        console.log('5 customers seeded.');

        // ===================== ACCOUNTS =====================
        const accounts = [
            // Rajesh - 1 Master
            { id: 'a0000001-0000-4000-a000-000000000001', custId: 'c0000001-0000-4000-a000-000000000001', type: 'MASTER', status: 'ACTIVE', parent: null },
            // Reliance - 1 Master + 1 Child
            { id: 'a0000002-0000-4000-a000-000000000002', custId: 'c0000002-0000-4000-a000-000000000002', type: 'MASTER', status: 'ACTIVE', parent: null },
            { id: 'a0000003-0000-4000-a000-000000000003', custId: 'c0000002-0000-4000-a000-000000000002', type: 'CHILD',  status: 'ACTIVE', parent: 'a0000002-0000-4000-a000-000000000002' },
            // Priya - 1 Master
            { id: 'a0000004-0000-4000-a000-000000000004', custId: 'c0000003-0000-4000-a000-000000000003', type: 'MASTER', status: 'ACTIVE', parent: null },
            // TechCorp - 1 Master (suspended)
            { id: 'a0000005-0000-4000-a000-000000000005', custId: 'c0000004-0000-4000-a000-000000000004', type: 'MASTER', status: 'SUSPENDED', parent: null },
            // Amit - 1 Master
            { id: 'a0000006-0000-4000-a000-000000000006', custId: 'c0000005-0000-4000-a000-000000000005', type: 'MASTER', status: 'ACTIVE', parent: null }
        ];
        for (const a of accounts) {
            const ver = a.status === 'SUSPENDED' ? 2 : 1;
            const billFlag = a.type === 'MASTER';
            await client.query(
                `INSERT INTO customer_account (id, tenant_id, customer_id, parent_account_id, account_level, status, billing_responsible_flag, version, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                [a.id, T, a.custId, a.parent, a.type, a.status, billFlag, ver]
            );
        }
        console.log('6 accounts seeded.');

        // ===================== SUBSCRIBERS =====================
        const subs = [
            // Rajesh's lines (2)
            { id: 'e0000001-0000-4000-a000-000000000001', code: '+91-98100-10001', accId: 'a0000001-0000-4000-a000-000000000001', cat: 'MOBILE', mode: 'POSTPAID', status: 'ACTIVE', ver: 2 },
            { id: 'e0000002-0000-4000-a000-000000000002', code: '+91-98100-10002', accId: 'a0000001-0000-4000-a000-000000000001', cat: 'BROADBAND', mode: 'POSTPAID', status: 'ACTIVE', ver: 2 },
            // Reliance Master account lines (2)
            { id: 'e0000003-0000-4000-a000-000000000003', code: '+91-22-6700-0001', accId: 'a0000002-0000-4000-a000-000000000002', cat: 'MOBILE', mode: 'POSTPAID', status: 'ACTIVE', ver: 2 },
            { id: 'e0000004-0000-4000-a000-000000000004', code: '+91-22-6700-0002', accId: 'a0000002-0000-4000-a000-000000000002', cat: 'MOBILE', mode: 'POSTPAID', status: 'SUSPENDED', ver: 3 },
            // Reliance Child account line (1)
            { id: 'e0000005-0000-4000-a000-000000000005', code: '+91-22-6700-0010', accId: 'a0000003-0000-4000-a000-000000000003', cat: 'M2M', mode: 'POSTPAID', status: 'ACTIVE', ver: 2 },
            // Priya's lines (2)
            { id: 'e0000006-0000-4000-a000-000000000006', code: '+91-98200-20001', accId: 'a0000004-0000-4000-a000-000000000004', cat: 'MOBILE', mode: 'PREPAID', status: 'ACTIVE', ver: 2 },
            { id: 'e0000007-0000-4000-a000-000000000007', code: '+91-98200-20002', accId: 'a0000004-0000-4000-a000-000000000004', cat: 'MOBILE', mode: 'PREPAID', status: 'BARRED', ver: 3 },
            // TechCorp's line (1 - disconnected)
            { id: 'e0000008-0000-4000-a000-000000000008', code: '+91-124-400-0001', accId: 'a0000005-0000-4000-a000-000000000005', cat: 'MOBILE', mode: 'POSTPAID', status: 'DISCONNECTED', ver: 4 },
            // Amit's line (1)
            { id: 'e0000009-0000-4000-a000-000000000009', code: '+91-98300-30001', accId: 'a0000006-0000-4000-a000-000000000006', cat: 'MOBILE', mode: 'PREPAID', status: 'PENDING', ver: 1 }
        ];
        for (const s of subs) {
            await client.query(
                `INSERT INTO subscriber (id, tenant_id, subscriber_code, customer_account_id, service_category, service_mode, status, version, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                [s.id, T, s.code, s.accId, s.cat, s.mode, s.status, s.ver]
            );
        }
        console.log('9 subscribers seeded across 5 customers.');

        console.log('\n=== SEED COMPLETE ===');
        console.log('Ready for end-to-end lifecycle testing.');

    } catch (e) {
        console.error('SEED FAILED:', e.message, e.detail || '');
    } finally {
        client.release();
        await pool.end();
    }
}

resetAndSeed();
