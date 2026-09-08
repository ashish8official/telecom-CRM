import { CataloguePort } from '../../domain/catalogue/CataloguePort';
import { CustomerDiscoveryContext, CatalogueDiscoveryResult, CatalogueDiscoveryStatus } from '../../domain/catalogue/CatalogueTypes';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ExternalServiceUnavailableError } from '../../domain/catalogue/CatalogueErrors';

export interface DiscoverProductOfferingsInput {
    customerId?: string;
    accountId?: string;
    subscriberId?: string;
}

export class DiscoverProductOfferings {
    constructor(
        private cataloguePort: CataloguePort,
        private customerRepo: ICustomerRepository,
        private accountRepo: ICustomerAccountRepository,
        private subscriberRepo: ISubscriberRepository
    ) {}

    async execute(tenantId: string, input: DiscoverProductOfferingsInput): Promise<CatalogueDiscoveryResult> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!input.customerId && !input.accountId && !input.subscriberId) {
            throw new ValidationError("At least one context ID (customer, account, or subscriber) is required");
        }

        try {
            const context = await this.buildTrustedContext(tenantId, input);
            return await this.cataloguePort.discoverOfferings(context);
        } catch (err: any) {
            // Graceful degradation for unavailable catalogue
            if (err instanceof ExternalServiceUnavailableError) {
                return {
                    status: CatalogueDiscoveryStatus.UNAVAILABLE,
                    discoveryMode: this.cataloguePort.getCapabilities().supportsContextualEligibility ? 'CONTEXTUAL_ELIGIBILITY' : 'BASIC_CATALOGUE_DISCOVERY' as any,
                    eligibilityStatus: 'NOT_EVALUATED' as any,
                    priceResolutionStatus: 'PRICE_UNAVAILABLE' as any,
                    capabilitiesUsed: {},
                    offerings: [],
                    message: "Product catalogue is temporarily unavailable"
                };
            }
            throw err;
        }
    }

    private async buildTrustedContext(tenantId: string, input: DiscoverProductOfferingsInput): Promise<CustomerDiscoveryContext> {
        const context: CustomerDiscoveryContext = {
            tenantId,
            effectiveAt: new Date()
        };

        if (input.subscriberId) {
            const subscriber = await this.subscriberRepo.getSubscriber(tenantId, input.subscriberId);
            if (!subscriber) throw new ValidationError("Invalid subscriber ID");
            
            context.subscriberId = subscriber.id;
            context.subscriberStatus = subscriber.status;
            context.serviceCategory = subscriber.serviceCategory;
            context.serviceMode = subscriber.serviceMode;
            if (subscriber.geographic) context.geographicContext = subscriber.geographic;

            input.accountId = subscriber.customerAccountId;
        }

        if (input.accountId) {
            const account = await this.accountRepo.findAccountById(tenantId, input.accountId);
            if (!account) throw new ValidationError("Invalid account ID");

            context.accountId = account.id;
            context.accountLevel = account.accountLevel;
            
            input.customerId = account.customerId;
        }

        if (input.customerId) {
            const customer = await this.customerRepo.getCustomerById(tenantId, input.customerId);
            if (!customer) throw new ValidationError("Invalid customer ID");

            context.customerId = customer.id;
            // Additional customer facts can be added here
        }

        return context;
    }
}
