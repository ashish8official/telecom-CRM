"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const PostgresPartyRepository_1 = require("../../infrastructure/repositories/PostgresPartyRepository");
const TransactionManager_1 = require("../../infrastructure/database/TransactionManager");
const CreateIndividualParty_1 = require("../../application/party/CreateIndividualParty");
const GetParty_1 = require("../../application/party/GetParty");
const DeleteParty_1 = require("../../application/party/DeleteParty");
const PartyErrors_1 = require("../../domain/party/PartyErrors");
const PartyTypes_1 = require("../../domain/party/PartyTypes");
require('dotenv').config();
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';
describe('Database Integration Tests', () => {
    let pool;
    let repo;
    let txManager;
    let createInd;
    let getParty;
    let deleteParty;
    beforeAll(async () => {
        pool = new pg_1.Pool({ connectionString });
        repo = new PostgresPartyRepository_1.PostgresPartyRepository(pool);
        txManager = new TransactionManager_1.PostgresTransactionManager(pool);
        createInd = new CreateIndividualParty_1.CreateIndividualParty(repo, txManager);
        getParty = new GetParty_1.GetParty(repo);
        deleteParty = new DeleteParty_1.DeleteParty(repo);
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
            const partyRes = await client.query(`INSERT INTO party (tenant_id, party_type) VALUES ($1, $2) RETURNING id`, [tenantA, PartyTypes_1.PartyType.INDIVIDUAL]);
            partyId = partyRes.rows[0].id;
            // Force subtype failure (e.g. violating NOT NULL on last_name)
            await client.query(`INSERT INTO individual (tenant_id, party_id, first_name) VALUES ($1, $2, $3)`, [tenantA, partyId, 'Test'] // missing last_name
            );
            await tx.commit();
        }
        catch (err) {
            await tx.rollback();
        }
        finally {
            tx.release();
        }
        // Verify party was not persisted (rollback succeeded)
        const check = await pool.query(`SELECT * FROM party WHERE id = $1`, [partyId]);
        expect(check.rowCount).toBe(0);
    });
    test('Tenant Isolation Test: Cross-tenant lookup fails', async () => {
        const ind = await createInd.execute(tenantA, { firstName: 'Cross', lastName: 'Tenant' });
        // Attempt lookup from Tenant B
        await expect(getParty.execute(tenantB, ind.id)).rejects.toThrow(PartyErrors_1.PartyNotFoundError);
    });
    test('Soft Delete Test: Deleted party cannot be retrieved', async () => {
        const ind = await createInd.execute(tenantA, { firstName: 'To', lastName: 'Delete' });
        // Soft delete
        await deleteParty.execute(tenantA, ind.id);
        // Verify GetParty fails
        await expect(getParty.execute(tenantA, ind.id)).rejects.toThrow(PartyErrors_1.PartyNotFoundError);
        // Verify row still exists in DB
        const check = await pool.query(`SELECT deleted_at FROM party WHERE id = $1`, [ind.id]);
        expect(check.rowCount).toBe(1);
        expect(check.rows[0].deleted_at).not.toBeNull();
    });
    test('Subtype Integrity Test: Individual creation yields correct subtype', async () => {
        const ind = await createInd.execute(tenantA, { firstName: 'Subtype', lastName: 'Check' });
        expect(ind.partyType).toBe(PartyTypes_1.PartyType.INDIVIDUAL);
        const partyCheck = await pool.query(`SELECT party_type FROM party WHERE id = $1`, [ind.id]);
        expect(partyCheck.rows[0].party_type).toBe(PartyTypes_1.PartyType.INDIVIDUAL);
        const orgCheck = await pool.query(`SELECT * FROM organization WHERE party_id = $1`, [ind.id]);
        expect(orgCheck.rowCount).toBe(0);
    });
});
