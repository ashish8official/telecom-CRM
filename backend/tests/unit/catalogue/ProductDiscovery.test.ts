import { DiscoverProductOfferings } from '../../../application/catalogue/DiscoverProductOfferings';
import { GenericTMF620Adapter } from '../../../infrastructure/catalogue/GenericTMF620Adapter';
import { InternalCatalogueAdapter } from '../../../infrastructure/catalogue/InternalCatalogueAdapter';
import { CircuitBreaker, CircuitBreakerState } from '../../../infrastructure/catalogue/Resilience';
import { ExternalServiceUnavailableError, ExternalServiceContractViolationError } from '../../../domain/catalogue/CatalogueErrors';
import { CatalogueDiscoveryStatus, DiscoveryMode, EligibilityStatus } from '../../../domain/catalogue/CatalogueTypes';
import { SubscriberStatus } from '../../../domain/subscriber/SubscriberTypes';

describe('Product Discovery Integration & Adapters', () => {
    
    // Mocks
    const mockCustomerRepo = { getCustomerById: jest.fn() };
    const mockAccountRepo = { findAccountById: jest.fn() };
    const mockSubscriberRepo = { getSubscriber: jest.fn() };
    
    const tenantId = 't-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Trusted Context Construction', () => {
        it('should construct rich context from subscriber id', async () => {
            mockSubscriberRepo.getSubscriber.mockResolvedValue({
                id: 'sub-1',
                customerAccountId: 'acc-1',
                status: SubscriberStatus.ACTIVE,
                serviceCategory: 'GSM',
                serviceMode: 'PREPAID',
                geographic: { level: 'PROVINCE', code: 'CM-CE' }
            });
            mockAccountRepo.findAccountById.mockResolvedValue({ id: 'acc-1', customerId: 'cust-1', accountLevel: 'MASTER' });
            mockCustomerRepo.getCustomerById.mockResolvedValue({ id: 'cust-1' });

            const mockPort = {
                getCapabilities: jest.fn().mockReturnValue({ supportsContextualEligibility: true }),
                discoverOfferings: jest.fn().mockResolvedValue({ status: 'SUCCESS' })
            } as any;

            const useCase = new DiscoverProductOfferings(mockPort, mockCustomerRepo as any, mockAccountRepo as any, mockSubscriberRepo as any);
            await useCase.execute(tenantId, { subscriberId: 'sub-1' });

            // Port should be called with fully constructed context
            expect(mockPort.discoverOfferings).toHaveBeenCalledWith(expect.objectContaining({
                tenantId,
                subscriberId: 'sub-1',
                subscriberStatus: 'ACTIVE',
                serviceCategory: 'GSM',
                serviceMode: 'PREPAID',
                accountId: 'acc-1',
                accountLevel: 'MASTER',
                customerId: 'cust-1',
                geographicContext: { level: 'PROVINCE', code: 'CM-CE' }
            }));
        });
    });

    describe('Resilience (Circuit Breaker & Retry)', () => {
        it('should retry transient errors and eventually fail via circuit breaker', async () => {
            const cb = new CircuitBreaker({ failureThreshold: 2, recoveryIntervalMs: 5000, timeoutMs: 10000 });
            let attempts = 0;
            const mockHttpClient = {
                get: jest.fn().mockImplementation(() => {
                    attempts++;
                    const err = new ExternalServiceUnavailableError('Catalogue', 'ECONNREFUSED');
                    
                    return Promise.reject(err);
                })
            };

            const adapter = new GenericTMF620Adapter('http://fake', cb, mockHttpClient);

            // First call fails after retries -> CB increments failure count
            await expect(adapter.discoverOfferings({ tenantId, effectiveAt: new Date() })).rejects.toThrow(ExternalServiceUnavailableError);
            expect(attempts).toBe(3); // bounded retry does 3 attempts before bubbling up

            attempts = 0;
            // Second call fails after retries -> CB hits threshold and OPENS
            await expect(adapter.discoverOfferings({ tenantId, effectiveAt: new Date() })).rejects.toThrow(ExternalServiceUnavailableError);
            expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

            // Third call fails immediately without making HTTP calls
            attempts = 0;
            await expect(adapter.discoverOfferings({ tenantId, effectiveAt: new Date() })).rejects.toThrow(/Circuit Breaker is OPEN/);
            expect(attempts).toBe(0);
        });
    });

    describe('Capability Honesty & Graceful Degradation', () => {
        it('Generic TMF620 should return NOT_EVALUATED for eligibility', async () => {
            const cb = new CircuitBreaker({ failureThreshold: 2, recoveryIntervalMs: 5000, timeoutMs: 10000 });
            const mockHttpClient = {
                get: jest.fn().mockResolvedValue({ data: [{ id: 'off-1', name: 'Offer 1' }] })
            };
            const adapter = new GenericTMF620Adapter('http://fake', cb, mockHttpClient);
            
            const result = await adapter.discoverOfferings({ tenantId, effectiveAt: new Date() });
            
            expect(result.status).toBe(CatalogueDiscoveryStatus.SUCCESS);
            expect(result.discoveryMode).toBe(DiscoveryMode.BASIC_CATALOGUE_DISCOVERY);
            expect(result.eligibilityStatus).toBe(EligibilityStatus.NOT_EVALUATED);
        });

        it('Internal Catalogue should return EVALUATED for eligibility', async () => {
            const cb = new CircuitBreaker({ failureThreshold: 2, recoveryIntervalMs: 5000, timeoutMs: 10000 });
            const mockHttpClient = {
                post: jest.fn().mockResolvedValue({ data: [{ id: 'off-1', name: 'Offer 1' }] })
            };
            const adapter = new InternalCatalogueAdapter('http://fake', cb, mockHttpClient);
            
            const result = await adapter.discoverOfferings({ tenantId, effectiveAt: new Date() });
            
            expect(result.status).toBe(CatalogueDiscoveryStatus.SUCCESS);
            expect(result.discoveryMode).toBe(DiscoveryMode.CONTEXTUAL_ELIGIBILITY);
            expect(result.eligibilityStatus).toBe(EligibilityStatus.EVALUATED);
        });

        it('DiscoverProductOfferings use case returns UNAVAILABLE cleanly on catalogue outage', async () => {
            const mockPort = {
                getCapabilities: jest.fn().mockReturnValue({ supportsContextualEligibility: false }),
                discoverOfferings: jest.fn().mockRejectedValue(new ExternalServiceUnavailableError('Catalogue', 'timeout'))
            } as any;
            mockCustomerRepo.getCustomerById.mockResolvedValue({ id: 'cust-1' });

            const useCase = new DiscoverProductOfferings(mockPort, mockCustomerRepo as any, mockAccountRepo as any, mockSubscriberRepo as any);
            const result = await useCase.execute(tenantId, { customerId: 'cust-1' });

            // Degrades gracefully
            expect(result.status).toBe(CatalogueDiscoveryStatus.UNAVAILABLE);
            expect(result.offerings).toEqual([]);
            expect(result.message).toContain('unavailable');
        });
    });

    describe('Contract Violation Handling', () => {
        it('returns CONTRACT_ERROR if response shape is invalid instead of throwing raw error', async () => {
            const cb = new CircuitBreaker({ failureThreshold: 2, recoveryIntervalMs: 5000, timeoutMs: 10000 });
            const mockHttpClient = {
                get: jest.fn().mockResolvedValue({ data: { "not": "an array" } }) // Should be an array
            };
            const adapter = new GenericTMF620Adapter('http://fake', cb, mockHttpClient);
            
            const result = await adapter.discoverOfferings({ tenantId, effectiveAt: new Date() });
            
            expect(result.status).toBe(CatalogueDiscoveryStatus.CONTRACT_ERROR);
            expect(result.offerings).toEqual([]);
        });
    });
});
