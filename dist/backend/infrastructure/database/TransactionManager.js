"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresTransactionManager = exports.PostgresTransaction = void 0;
class PostgresTransaction {
    client;
    constructor(client) {
        this.client = client;
    }
    async commit() {
        await this.client.query('COMMIT');
    }
    async rollback() {
        await this.client.query('ROLLBACK');
    }
    release() {
        this.client.release();
    }
    getConnection() {
        return this.client;
    }
}
exports.PostgresTransaction = PostgresTransaction;
class PostgresTransactionManager {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async beginTransaction() {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return new PostgresTransaction(client);
    }
}
exports.PostgresTransactionManager = PostgresTransactionManager;
