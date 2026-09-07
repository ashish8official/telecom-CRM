import { Pool } from 'pg';
import { PostgresPartyRepository } from '../../infrastructure/repositories/PostgresPartyRepository';
import { PostgresTransactionManager } from '../../infrastructure/database/TransactionManager';
import { CreateIndividualParty } from '../../application/party/CreateIndividualParty';
import { GetParty } from '../../application/party/GetParty';
import { DeleteParty } from '../../application/party/DeleteParty';
import { PartyNotFoundError } from '../../domain/party/PartyErrors';
import { PartyType } from '../../domain/party/PartyTypes';

require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

describe('Database Integration Tests', () => {
    let pool: Pool;
    let repo: PostgresPartyRepository;
    let txManager: PostgresTransactionManager;
    let createInd: CreateIndividualParty;
    let getParty: GetParty;
    let deleteParty: DeleteParty;

    beforeAll(async () => {
        pool = new Pool({ connectionString });
        repo = new PostgresPartyRepository(pool);
        txManager = new PostgresTransactionManager(pool);
        createInd = new CreateIndividualParty(repo, txManager);
        getParty = new GetParty(repo);
        deleteParty = new DeleteParty(repo);

        // Ensure DEMO tenants exist for tests (using seeds or creating ad-hoc)
        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ('33333333-3333-3333-3333-333333333333', 'INT_A', 'Integration A') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO tenant (id, tenant_code, name) VALUES ('44444444-4444-4444-4444-444444444444', 'INT_B', 'Integration B') ON CONFLICT DO NOTHING`);
    });

    afterAll(async () => {
        await pool.end();
    });

    const tenantA = '33333333-3333-3333-3333-333333333333';
    const tenantB = '44444444-4444-4444-4444-444444444444';

    test('Atomicity Test: Failed subtype creation leaves no orphan Party', async () => {
        const tx = await txManager.beginTransaction();
        const client = tx.getConnection();
        
        let partyId;
        try {
            // Create party
            const partyRes = await client.query(
                `INSERT INTO party (tenant_id, party_type) VALUES ($1, $2) RETURNING id`,
                [tenantA, PartyType.INDIVIDUAL]
            );
            partyId = partyRes.rows[0].id;
            
            // Force subtype failure (e.g. violating NOT NULL on last_name)
            await client.query(
                `INSERT INTO individual (tenant_id, party_id, first_name) VALUES ($1, $2, $3)`,
                [tenantA, partyId, 'Test'] // missing last_name
            );
            await tx.commit();
        } catch (err) {
            await tx.rollback();
        } finally {
            tx.release();
        }

        // Verify party was not persisted (rollback succeeded)
        const check = await pool.query(`SELECT * FROM party WHERE id = $1`, [partyId]);
        expect(check.rowCount).toBe(0);
    });

    test('Tenant Isolation Test: Cross-tenant lookup fails', async () => {
        const ind = await createInd.execute(tenantA, { firstName: 'Cross', lastName: 'Tenant' });
        
        // Attempt lookup from Tenant B
        await expect(getParty.execute(tenantB, ind.id)).rejects.toThrow(PartyNotFoundError);
    });

    test('Soft Delete Test: Deleted party cannot be retrieved', async () => {
        const ind = await createInd.execute(tenantA, { firstName: 'To', lastName: 'Delete' });
        
        // Soft delete
        await deleteParty.execute(tenantA, ind.id);

        // Verify GetParty fails
        await expect(getParty.execute(tenantA, ind.id)).rejects.toThrow(PartyNotFoundError);

        // Verify row still exists in DB
        const check = await pool.query(`SELECT deleted_at FROM party WHERE id = $1`, [ind.id]);
        expect(check.rowCount).toBe(1);
        expect(check.rows[0].deleted_at).not.toBeNull();
    });

    test('Subtype Integrity Test: Individual creation yields correct subtype', async () => {
        const ind = await createInd.execute(tenantA, { firstName: 'Subtype', lastName: 'Check' });
        
        expect(ind.partyType).toBe(PartyType.INDIVIDUAL);
        
        const partyCheck = await pool.query(`SELECT party_type FROM party WHERE id = $1`, [ind.id]);
        expect(partyCheck.rows[0].party_type).toBe(PartyType.INDIVIDUAL);
        
        const orgCheck = await pool.query(`SELECT * FROM organization WHERE party_id = $1`, [ind.id]);
        expect(orgCheck.rowCount).toBe(0);
    });
});
