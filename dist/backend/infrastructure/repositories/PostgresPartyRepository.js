"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresPartyRepository = void 0;
const PartyTypes_1 = require("../../domain/party/PartyTypes");
class PostgresPartyRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    getClient(tx) {
        return tx ? tx.getConnection() : this.pool;
    }
    async createIndividual(tenantId, individual, tx) {
        const client = this.getClient(tx);
        const partyRes = await client.query(`INSERT INTO party (tenant_id, party_type, status, created_by) 
             VALUES ($1, $2, $3, $4) RETURNING *`, [tenantId, PartyTypes_1.PartyType.INDIVIDUAL, individual.status || PartyTypes_1.PartyStatus.ACTIVE, individual.createdBy]);
        const partyId = partyRes.rows[0].id;
        const indRes = await client.query(`INSERT INTO individual (tenant_id, party_id, first_name, middle_name, last_name, title, gender, date_of_birth) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [tenantId, partyId, individual.firstName, individual.middleName, individual.lastName, individual.title, individual.gender, individual.dateOfBirth]);
        return {
            ...partyRes.rows[0],
            ...indRes.rows[0],
            partyType: PartyTypes_1.PartyType.INDIVIDUAL
        };
    }
    async createOrganization(tenantId, organization, tx) {
        const client = this.getClient(tx);
        const partyRes = await client.query(`INSERT INTO party (tenant_id, party_type, status, created_by) 
             VALUES ($1, $2, $3, $4) RETURNING *`, [tenantId, PartyTypes_1.PartyType.ORGANIZATION, organization.status || PartyTypes_1.PartyStatus.ACTIVE, organization.createdBy]);
        const partyId = partyRes.rows[0].id;
        const orgRes = await client.query(`INSERT INTO organization (tenant_id, party_id, legal_name, trading_name, registration_number, established_date) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [tenantId, partyId, organization.legalName, organization.tradingName, organization.registrationNumber, organization.establishedDate]);
        return {
            ...partyRes.rows[0],
            ...orgRes.rows[0],
            partyType: PartyTypes_1.PartyType.ORGANIZATION
        };
    }
    async getParty(tenantId, partyId, tx) {
        const client = this.getClient(tx);
        const partyRes = await client.query(`SELECT * FROM party WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`, [tenantId, partyId]);
        if (partyRes.rowCount === 0)
            return null;
        const party = partyRes.rows[0];
        if (party.party_type === PartyTypes_1.PartyType.INDIVIDUAL) {
            const indRes = await client.query(`SELECT * FROM individual WHERE tenant_id = $1 AND party_id = $2`, [tenantId, partyId]);
            return { ...party, ...indRes.rows[0] };
        }
        else if (party.party_type === PartyTypes_1.PartyType.ORGANIZATION) {
            const orgRes = await client.query(`SELECT * FROM organization WHERE tenant_id = $1 AND party_id = $2`, [tenantId, partyId]);
            return { ...party, ...orgRes.rows[0] };
        }
        return party;
    }
    async updateIndividual(tenantId, partyId, data, tx) {
        const client = this.getClient(tx);
        await client.query(`UPDATE party SET updated_by = $1 WHERE tenant_id = $2 AND id = $3 AND deleted_at IS NULL`, [data.updatedBy, tenantId, partyId]);
        await client.query(`UPDATE individual 
             SET first_name = COALESCE($1, first_name),
                 middle_name = COALESCE($2, middle_name),
                 last_name = COALESCE($3, last_name),
                 title = COALESCE($4, title),
                 gender = COALESCE($5, gender),
                 date_of_birth = COALESCE($6, date_of_birth)
             WHERE tenant_id = $7 AND party_id = $8`, [data.firstName, data.middleName, data.lastName, data.title, data.gender, data.dateOfBirth, tenantId, partyId]);
        return this.getParty(tenantId, partyId, tx);
    }
    async updateOrganization(tenantId, partyId, data, tx) {
        const client = this.getClient(tx);
        await client.query(`UPDATE party SET updated_by = $1 WHERE tenant_id = $2 AND id = $3 AND deleted_at IS NULL`, [data.updatedBy, tenantId, partyId]);
        await client.query(`UPDATE organization 
             SET legal_name = COALESCE($1, legal_name),
                 trading_name = COALESCE($2, trading_name),
                 registration_number = COALESCE($3, registration_number),
                 established_date = COALESCE($4, established_date)
             WHERE tenant_id = $5 AND party_id = $6`, [data.legalName, data.tradingName, data.registrationNumber, data.establishedDate, tenantId, partyId]);
        return this.getParty(tenantId, partyId, tx);
    }
    async updateStatus(tenantId, partyId, status, updatedBy, tx) {
        const client = this.getClient(tx);
        await client.query(`UPDATE party SET status = $1, updated_by = $2 WHERE tenant_id = $3 AND id = $4 AND deleted_at IS NULL`, [status, updatedBy, tenantId, partyId]);
        return this.getParty(tenantId, partyId, tx);
    }
    async softDelete(tenantId, partyId, tx) {
        const client = this.getClient(tx);
        await client.query(`UPDATE party SET deleted_at = NOW() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`, [tenantId, partyId]);
    }
    async findPotentialDuplicates(tenantId, type, criteria, tx) {
        const client = this.getClient(tx);
        if (type === 'INDIVIDUAL' && criteria.firstName && criteria.lastName) {
            const res = await client.query(`SELECT p.*, i.first_name, i.last_name 
                 FROM party p 
                 JOIN individual i ON p.id = i.party_id AND p.tenant_id = i.tenant_id
                 WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND i.first_name = $2 AND i.last_name = $3`, [tenantId, criteria.firstName, criteria.lastName]);
            return res.rows;
        }
        else if (type === 'ORGANIZATION' && criteria.legalName) {
            const res = await client.query(`SELECT p.*, o.legal_name 
                 FROM party p 
                 JOIN organization o ON p.id = o.party_id AND p.tenant_id = o.tenant_id
                 WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND o.legal_name = $2`, [tenantId, criteria.legalName]);
            return res.rows;
        }
        return [];
    }
}
exports.PostgresPartyRepository = PostgresPartyRepository;
