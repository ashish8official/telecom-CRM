import { Pool } from 'pg';
import { createApp } from './app';
import { PostgresCustomerRepository } from '../infrastructure/repositories/PostgresCustomerRepository';
import { PostgresPartyRepository } from '../infrastructure/repositories/PostgresPartyRepository';
import { PostgresCustomerAccountRepository } from '../infrastructure/repositories/PostgresCustomerAccountRepository';
import { PostgresSubscriberRepository } from '../infrastructure/repositories/PostgresSubscriberRepository';
import { PostgresTransactionManager } from '../infrastructure/database/TransactionManager';
import { PostgresIdempotencyManager } from '../infrastructure/idempotency/PostgresIdempotencyManager';
import { InternalCatalogueAdapter } from '../infrastructure/catalogue/InternalCatalogueAdapter';
import { CircuitBreaker } from '../infrastructure/catalogue/Resilience';

require('dotenv').config();

const port = process.env.PORT || 3000;
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

async function bootstrap() {
    const pool = new Pool({ connectionString });

    // Initialize dependencies
    const txManager = new PostgresTransactionManager(pool);
    const idempotencyManager = new PostgresIdempotencyManager(pool);
    const customerRepo = new PostgresCustomerRepository(pool);
    const partyRepo = new PostgresPartyRepository(pool);
    const customerAccountRepo = new PostgresCustomerAccountRepository(pool);
    const subscriberRepo = new PostgresSubscriberRepository(pool);

    const catalogueUrl = process.env.CATALOGUE_API_URL || 'http://localhost:8080';
    const catalogueTenantId = process.env.CATALOGUE_TENANT_ID || '17000000-0000-4000-a000-000000000000';
    const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        recoveryIntervalMs: 10000,
        timeoutMs: 5000
    });
    const cataloguePort = new InternalCatalogueAdapter(catalogueUrl, circuitBreaker, catalogueTenantId);

    const app = createApp({
        customerRepo,
        partyRepo,
        customerAccountRepo,
        subscriberRepo,
        txManager,
        idempotencyManager,
        cataloguePort
    });

    const server = app.listen(port, () => {
        console.log(`🚀 Telecom CRM API running on port ${port}`);
    });

    // Graceful Shutdown
    const shutdown = async () => {
        console.log('Received shutdown signal. Closing HTTP server...');
        server.close(async () => {
            console.log('HTTP server closed.');
            console.log('Closing database connection pool...');
            await pool.end();
            console.log('Database connections closed.');
            process.exit(0);
        });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

bootstrap().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
