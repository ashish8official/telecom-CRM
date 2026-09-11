import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { CataloguePort } from '../../domain/catalogue/CataloguePort';
import { CustomerNotFoundError } from '../../domain/customer/CustomerErrors';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { Customer360Response, Customer360Account, Customer360Subscriber } from './Customer360Response';
import { CustomerDiscoveryContext, CatalogueDiscoveryStatus } from '../../domain/catalogue/CatalogueTypes';

export class GetCustomer360 {
    constructor(
        private customerRepo: ICustomerRepository,
        private accountRepo: ICustomerAccountRepository,
        private subscriberRepo: ISubscriberRepository,
        private cataloguePort?: CataloguePort // Optional to support systems without a catalogue
    ) {}

    async execute(tenantId: string, customerId: string): Promise<Customer360Response> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!customerId) throw new ValidationError("Customer ID is required");

        // 1. Load Customer
        const customer = await this.customerRepo.getCustomerById(tenantId, customerId);
        if (!customer) {
            throw new CustomerNotFoundError(customerId, tenantId);
        }

        // 2. Load Accounts
        const accounts = await this.accountRepo.findAccountsByCustomerId(tenantId, customerId);
        
        // 3. Load all Subscribers for these accounts to avoid N+1
        const accountIds = accounts.map(a => a.id);
        const allSubscribers = await this.subscriberRepo.findSubscribersByAccountIds(tenantId, accountIds);

        // Helper to resolve billing account in memory
        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const resolveBillingAccountId = (accId: string): string => {
            const acc = accountMap.get(accId);
            if (!acc) return accId; // Fallback
            if (acc.billingResponsibleFlag) return acc.id;
            if (acc.parentAccountId) return resolveBillingAccountId(acc.parentAccountId);
            return acc.id; // Fallback if misconfigured
        };

        // 4. Map Subscribers
        const mappedSubscribers: Customer360Subscriber[] = allSubscribers.map(sub => ({
            id: sub.id,
            subscriberCode: sub.subscriberCode,
            status: sub.status,
            serviceCategory: sub.serviceCategory,
            serviceMode: sub.serviceMode,
            directAccountId: sub.customerAccountId,
            billingAccountId: resolveBillingAccountId(sub.customerAccountId),
            geographicContext: sub.geographic
        }));

        const subsByAccount = new Map<string, Customer360Subscriber[]>();
        for (const sub of mappedSubscribers) {
            if (!subsByAccount.has(sub.directAccountId)) {
                subsByAccount.set(sub.directAccountId, []);
            }
            subsByAccount.get(sub.directAccountId)!.push(sub);
        }

        // 5. Map Accounts
        const mappedAccounts: Customer360Account[] = accounts.map(acc => ({
            id: acc.id,
            accountType: acc.accountLevel,
            status: acc.status,
            parentAccountId: acc.parentAccountId,
            billingAccountId: resolveBillingAccountId(acc.id),
            billingResponsibleFlag: acc.billingResponsibleFlag,
            subscribers: subsByAccount.get(acc.id) || []
        }));

        // 6. Build Discovery Context
        // We will build a unified context for the customer. If they have active subscribers, we can use the first active one as a primary context if needed, or just pass Customer/Account level facts.
        // To avoid N+1 calls, we make one call for the customer overall.
        const discoveryContext: CustomerDiscoveryContext = {
            tenantId,
            customerId: customer.id,
            customerCategory: customer.customerCategory,
            customerType: undefined, // Would come from Party
            effectiveAt: new Date()
        };

        // If there's at least one account, append account context (prioritize master)
        const masterAccount = accounts.find(a => a.billingResponsibleFlag);
        if (masterAccount) {
            discoveryContext.accountId = masterAccount.id;
            discoveryContext.accountLevel = masterAccount.accountLevel;
        }

        // 7. Call Product Discovery (Graceful fallback)
        let productDiscoveryStatus: 'SUCCESS' | 'UNAVAILABLE' = 'SUCCESS';
        let productDiscoveryData = null;

        if (this.cataloguePort) {
            try {
                productDiscoveryData = await this.cataloguePort.discoverOfferings(discoveryContext);
                if (productDiscoveryData.status === CatalogueDiscoveryStatus.UNAVAILABLE) {
                    productDiscoveryStatus = 'UNAVAILABLE';
                }
            } catch (err) {
                // Graceful degradation
                productDiscoveryStatus = 'UNAVAILABLE';
                productDiscoveryData = {
                    status: CatalogueDiscoveryStatus.UNAVAILABLE,
                    discoveryMode: null,
                    eligibilityStatus: null,
                    priceResolutionStatus: null,
                    capabilitiesUsed: {},
                    offerings: [],
                    message: "Catalogue is unavailable"
                } as any;
            }
        } else {
            productDiscoveryStatus = 'UNAVAILABLE';
        }

        // 8. Construct 360 Response
        return {
            customer: {
                status: 'SUCCESS',
                data: {
                    id: customer.id,
                    status: customer.status,
                    customerCategory: customer.customerCategory,
                    customerSegment: customer.customerSegment,
                    partyId: customer.partyId
                }
            },
            accounts: {
                status: 'SUCCESS',
                data: mappedAccounts
            },
            // Contacts, Preferences, Consents are not yet implemented in this CRM
            contacts: { status: 'NOT_IMPLEMENTED', data: [] },
            preferences: { status: 'NOT_IMPLEMENTED', data: [] },
            consents: { status: 'NOT_IMPLEMENTED', data: [] },
            productDiscovery: {
                status: productDiscoveryStatus,
                data: productDiscoveryData
            }
        };
    }
}
