import { Pool, PoolClient } from 'pg';
import { ITransaction } from '../../domain/common/transaction/ITransaction';
import { IPartyRepository } from '../../domain/party/PartyRepository';
import { Individual, Organization, Party, PartyStatus, PartyType, UpdateIndividualInput, UpdateOrganizationInput, CreateIndividualInput, CreateOrganizationInput, DuplicateCriteria } from '../../domain/party/PartyTypes';

export class PostgresPartyRepository implements IPartyRepository {

    private mapToParty(row: any): Party {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            partyType: row.party_type as PartyType,
            status: row.status as PartyStatus,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            createdBy: row.created_by,
            updatedBy: row.updated_by
        };
    }

    private mapToIndividual(partyRow: any, indRow: any): Individual {
        return {
            ...this.mapToParty(partyRow),
            firstName: indRow.first_name,
            lastName: indRow.last_name,
            middleName: indRow.middle_name,
            title: indRow.title,
            gender: indRow.gender,
            dateOfBirth: indRow.date_of_birth
        } as Individual;
    }

    private mapToOrganization(partyRow: any, orgRow: any): Organization {
        return {
            ...this.mapToParty(partyRow),
            legalName: orgRow.legal_name,
            tradingName: orgRow.trading_name,
            registrationNumber: orgRow.registration_number,
            establishedDate: orgRow.established_date
        } as Organization;
    }

    constructor(private pool: Pool) {}

    private getClient(tx?: ITransaction): PoolClient | Pool {
        return tx ? tx.getConnection() as PoolClient : this.pool;
    }

    async createIndividual(tenantId: string, individual: Partial<Individual>, tx?: ITransaction): Promise<Individual> {
        const client = this.getClient(tx);
        const partyRes = await client.query(
            `INSERT INTO party (tenant_id, party_type, status, created_by) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenantId, PartyType.INDIVIDUAL, individual.status || PartyStatus.ACTIVE, individual.createdBy]
        );
        const partyId = partyRes.rows[0].id;

        const indRes = await client.query(
            `INSERT INTO individual (tenant_id, party_id, first_name, middle_name, last_name, title, gender, date_of_birth) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [tenantId, partyId, individual.firstName, individual.middleName, individual.lastName, individual.title, individual.gender, individual.dateOfBirth]
        );

        return {
            ...partyRes.rows[0],
            ...indRes.rows[0],
            id: partyId,
            partyType: PartyType.INDIVIDUAL
        } as Individual;
    }

    async createOrganization(tenantId: string, organization: Partial<Organization>, tx?: ITransaction): Promise<Organization> {
        const client = this.getClient(tx);
        const partyRes = await client.query(
            `INSERT INTO party (tenant_id, party_type, status, created_by) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenantId, PartyType.ORGANIZATION, organization.status || PartyStatus.ACTIVE, organization.createdBy]
        );
        const partyId = partyRes.rows[0].id;

        const orgRes = await client.query(
            `INSERT INTO organization (tenant_id, party_id, legal_name, trading_name, registration_number, established_date) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [tenantId, partyId, organization.legalName, organization.tradingName, organization.registrationNumber, organization.establishedDate]
        );

        return {
            ...partyRes.rows[0],
            ...orgRes.rows[0],
            id: partyId,
            partyType: PartyType.ORGANIZATION
        } as Organization;
    }

    async getParty(tenantId: string, partyId: string, tx?: ITransaction): Promise<Party | Individual | Organization | null> {
        const client = this.getClient(tx);
        const partyRes = await client.query(
            `SELECT * FROM party WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
            [tenantId, partyId]
        );

        if (partyRes.rowCount === 0) return null;
        const party = partyRes.rows[0];

        if (party.party_type === PartyType.INDIVIDUAL) {
            const indRes = await client.query(`SELECT * FROM individual WHERE tenant_id = $1 AND party_id = $2`, [tenantId, partyId]);
            return this.mapToIndividual(party, indRes.rows[0]);
        } else if (party.party_type === PartyType.ORGANIZATION) {
            const orgRes = await client.query(`SELECT * FROM organization WHERE tenant_id = $1 AND party_id = $2`, [tenantId, partyId]);
            return this.mapToOrganization(party, orgRes.rows[0]);
        }
        return this.mapToParty(party);
    }

    async updateIndividual(tenantId: string, partyId: string, data: UpdateIndividualInput, tx?: ITransaction): Promise<Individual> {
        const client = this.getClient(tx);
        await client.query(`UPDATE party SET updated_by = $1 WHERE tenant_id = $2 AND id = $3 AND deleted_at IS NULL`, [data.updatedBy, tenantId, partyId]);
        
        await client.query(
            `UPDATE individual 
             SET first_name = COALESCE($1, first_name),
                 middle_name = COALESCE($2, middle_name),
                 last_name = COALESCE($3, last_name),
                 title = COALESCE($4, title),
                 gender = COALESCE($5, gender),
                 date_of_birth = COALESCE($6, date_of_birth)
             WHERE tenant_id = $7 AND party_id = $8`,
            [data.firstName, data.middleName, data.lastName, data.title, data.gender, data.dateOfBirth, tenantId, partyId]
        );

        return this.getParty(tenantId, partyId, tx) as Promise<Individual>;
    }

    async updateOrganization(tenantId: string, partyId: string, data: UpdateOrganizationInput, tx?: ITransaction): Promise<Organization> {
        const client = this.getClient(tx);
        await client.query(`UPDATE party SET updated_by = $1 WHERE tenant_id = $2 AND id = $3 AND deleted_at IS NULL`, [data.updatedBy, tenantId, partyId]);

        await client.query(
            `UPDATE organization 
             SET legal_name = COALESCE($1, legal_name),
                 trading_name = COALESCE($2, trading_name),
                 registration_number = COALESCE($3, registration_number),
                 established_date = COALESCE($4, established_date)
             WHERE tenant_id = $5 AND party_id = $6`,
            [data.legalName, data.tradingName, data.registrationNumber, data.establishedDate, tenantId, partyId]
        );

        return this.getParty(tenantId, partyId, tx) as Promise<Organization>;
    }

    async updateStatus(tenantId: string, partyId: string, status: PartyStatus, updatedBy?: string, tx?: ITransaction): Promise<Party> {
        const client = this.getClient(tx);
        await client.query(
            `UPDATE party SET status = $1, updated_by = $2 WHERE tenant_id = $3 AND id = $4 AND deleted_at IS NULL`,
            [status, updatedBy, tenantId, partyId]
        );
        return this.getParty(tenantId, partyId, tx) as Promise<Party>;
    }

    async softDelete(tenantId: string, partyId: string, tx?: ITransaction): Promise<void> {
        const client = this.getClient(tx);
        await client.query(`UPDATE party SET deleted_at = NOW() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`, [tenantId, partyId]);
    }

    async findPotentialDuplicates(tenantId: string, type: 'INDIVIDUAL' | 'ORGANIZATION', criteria: DuplicateCriteria, tx?: ITransaction): Promise<Party[]> {
        const client = this.getClient(tx);
        if (type === 'INDIVIDUAL' && ('firstName' in criteria ? criteria.firstName : null) && ('lastName' in criteria ? criteria.lastName : null)) {
            const res = await client.query(
                `SELECT p.*, i.first_name, i.last_name 
                 FROM party p 
                 JOIN individual i ON p.id = i.party_id AND p.tenant_id = i.tenant_id
                 WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND i.first_name = $2 AND i.last_name = $3`,
                [tenantId, ('firstName' in criteria ? criteria.firstName : null), ('lastName' in criteria ? criteria.lastName : null)]
            );
            return res.rows;
        } else if (type === 'ORGANIZATION' && ('legalName' in criteria ? criteria.legalName : null)) {
            const res = await client.query(
                `SELECT p.*, o.legal_name 
                 FROM party p 
                 JOIN organization o ON p.id = o.party_id AND p.tenant_id = o.tenant_id
                 WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND o.legal_name = $2`,
                [tenantId, ('legalName' in criteria ? criteria.legalName : null)]
            );
            return res.rows;
        }
        return [];
    }
}
