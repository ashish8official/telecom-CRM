import { CustomerEligibilityContext } from '../../../application/catalogue/CustomerEligibilityContext';

describe('CustomerEligibilityContext Contract', () => {
    test('Constructs factual context without catalogue rules', () => {
        // The CRM constructs an eligibility context purely from facts it owns
        const context: CustomerEligibilityContext = {
            tenant: {
                id: 't-123'
            },
            customer: {
                id: 'c-456',
                status: 'ACTIVE',
                customerCategory: 'RESIDENTIAL',
                preferredLanguage: 'fr-CM' // Communication fact, not commercial rule
            },
            account: {
                id: 'ca-789',
                accountLevel: 'MASTER'
            },
            geographic: {
                level: 'PROVINCE',
                code: 'CM-CE',
                name: 'Centre Region'
            }
        };

        // Verification of CRM boundaries:
        // 1. Context should contain the geographic reference.
        expect(context.geographic).toBeDefined();
        expect(context.geographic?.code).toBe('CM-CE');

        // 2. Context should NOT contain product inclusions/exclusions,
        // which are Catalogue rules.
        expect((context as any).eligibleProducts).toBeUndefined();
        expect((context as any).excludedMarkets).toBeUndefined();
    });

    test('Geographic context is optional to support progressive enrichment', () => {
        // A Prospect customer might not have a service location yet.
        const prospectContext: CustomerEligibilityContext = {
            tenant: { id: 't-123' },
            customer: {
                id: 'p-999',
                status: 'PROSPECT'
            }
        };

        expect(prospectContext.geographic).toBeUndefined();
        expect(prospectContext.customer.id).toBe('p-999');
    });
});
