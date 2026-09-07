import { Pool, PoolClient } from 'pg';
import { ITransactionManager } from '../../application/party/ITransactionManager';
import { ITransaction } from '../../domain/party/PartyRepository';

export class PostgresTransaction implements ITransaction {
    constructor(private client: PoolClient) {}

    async commit(): Promise<void> {
        await this.client.query('COMMIT');
    }

    async rollback(): Promise<void> {
        await this.client.query('ROLLBACK');
    }

    release(): void {
        this.client.release();
    }

    getConnection(): PoolClient {
        return this.client;
    }
}

export class PostgresTransactionManager implements ITransactionManager {
    constructor(private pool: Pool) {}

    async beginTransaction(): Promise<ITransaction> {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return new PostgresTransaction(client);
    }
}
