import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { tenantMiddleware } from './middleware/tenant';
import { errorHandler } from './middleware/error';

// Import routers
import { customerRouter } from './routes/customer';
import { customerAccountRouter } from './routes/customer_account';
import { subscriberRouter } from './routes/subscriber';

// Import IoC / Dependency interfaces
import { ICustomerRepository } from '../domain/customer/CustomerRepository';
import { IPartyRepository } from '../domain/party/PartyRepository';
import { ICustomerAccountRepository } from '../domain/customer_account/CustomerAccountRepository';
import { ISubscriberRepository } from '../domain/subscriber/SubscriberRepository';
import { ITransactionManager } from '../domain/common/transaction/ITransactionManager';
import { IIdempotencyManager } from '../domain/common/idempotency/IIdempotencyManager';
import { CataloguePort } from '../domain/catalogue/CataloguePort';

export interface AppDependencies {
    customerRepo: ICustomerRepository;
    partyRepo: IPartyRepository;
    customerAccountRepo: ICustomerAccountRepository;
    subscriberRepo: ISubscriberRepository;
    txManager: ITransactionManager;
    idempotencyManager: IIdempotencyManager;
    cataloguePort?: CataloguePort;
}

import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';

export const createApp = (deps: AppDependencies) => {
    const app = express();

    // Standard Middlewares
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(morgan('combined')); // Log requests

    // Swagger Documentation
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

    // Tenant boundary
    app.use(tenantMiddleware);

    // Routes
    app.use('/customers', customerRouter(deps));
    app.use('/accounts', customerAccountRouter(deps));
    app.use('/subscribers', subscriberRouter(deps));

    // Global Error Handler
    app.use(errorHandler);

    return app;
};
