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

        test('Transaction Safety: Failed subtype creation rolls back Party', async () => {
        // We will pass a firstName that exceeds the VARCHAR(255) limit in the DB.
        // The CreateIndividualParty usecase will:
        // 1. begin transaction
        // 2. successfully insert into party table
        // 3. fail to insert into individual table due to length violation
        // 4. catch the error and rollback the transaction
        // We then verify the party table does not have an orphan record.
        
        const longFirstName = 'a'.repeat(300);
        let errorCaught = false;

        // Get count before
        const countBefore = await pool.query('SELECT count(*) FROM party WHERE tenant_id = $1', [tenantA]);

        try {
            await createInd.execute(tenantA, { firstName: longFirstName, lastName: 'Doe' });
        } catch (err: any) {
            errorCaught = true;
            // Should be a DB error code for string data right truncation (22001)
            expect(err.code).toBe('22001');
        }

        expect(errorCaught).toBe(true);

        // Verify party was not persisted (rollback succeeded)
        const countAfter = await pool.query('SELECT count(*) FROM party WHERE tenant_id = $1', [tenantA]);
        expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
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
