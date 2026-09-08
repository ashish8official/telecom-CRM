# CRM TASK 10: PRODUCT DISCOVERY & CATALOGUE INTEGRATION

## A. Architecture

The implementation completely abstracts external Product Catalogues behind a CRM-owned `CataloguePort`. The CRM application layer constructs a "Trusted Context" and queries the port. Adapters translate this to either generic TMF620 or internal Catalogue models.

```text
                         ┌─────────────────────┐
                         │       CRM API       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Product Discovery   │
                         │     Use Case        │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Catalogue Port    │
                         │   CRM-Owned DTOs    │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
          ┌────────────────────┐       ┌────────────────────┐
          │ Internal Catalogue │       │ Generic TMF620     │
          │ Adapter            │       │ Adapter            │
          └─────────┬──────────┘       └─────────┬──────────┘
                    │                            │
                    └────────────┬───────────────┘
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │ External Catalogue   │
                      └──────────────────────┘
```

## B. Domain Ownership

- **CRM → Customer Facts:** (Customer, Account, Subscriber, Service Category, Market). The API client cannot invent facts; `DiscoverProductOfferings` constructs the context authoritatively from CRM Repositories.
- **Catalogue → Commercial Decisions:** The CRM never evaluates bundle stacking, required dependencies, or pricing. The catalogue does.

## C. Capability Model

Catalogues differ in their capabilities. The `CatalogueCapabilities` interface defines:
- `supportsBasicOfferingDiscovery`
- `supportsContextualEligibility`
- `supportsPriceLookup`

## D. Portability

- **Generic TMF620 Adapter:** Lowest common denominator. Calls `/productOffering` and blindly returns results without deep contextual evaluations.
- **Internal Catalogue Adapter:** Full fidelity. Passes the rich `CustomerDiscoveryContext` to evaluate market mapping and dynamic overrides.

## E. Eligibility Boundary

CRM is strictly honest about its capabilities.
If an adapter only performs **Basic Catalogue Discovery** (e.g. `GenericTMF620Adapter`), the `eligibilityStatus` is strictly `NOT_EVALUATED` and the discovery mode is `BASIC_CATALOGUE_DISCOVERY`. The UI must never display "Eligible Offers" to a user if the backend could only list the catalog.
If the adapter is the `InternalCatalogueAdapter`, the mode switches to `CONTEXTUAL_ELIGIBILITY` and `EVALUATED`.

## F. Resilience

- **Timeout:** All HTTP calls are wrapped in a strict timeout mechanism.
- **Retry:** Bounded exponential backoff retries only occur on transient errors (e.g., Network timeouts, 502, 503, 504). `404` or Contract Violations are never retried.
- **Circuit Breaker:** State machine (`CLOSED` -> `OPEN` -> `HALF_OPEN`) protects the CRM from waiting on dead Catalogue endpoints, instantly failing fast when the threshold is reached.
- **Graceful Degradation:** If the Catalogue goes down, the CRM application layer catches `ExternalServiceUnavailableError` and returns a `UNAVAILABLE` status cleanly rather than crashing the system.

## G. Failure Semantics

- **NO_RESULTS:** The catalogue successfully searched but found nothing.
- **UNAVAILABLE:** The catalogue is down or unreachable.
- **CONTRACT_ERROR:** The catalogue returned a malformed payload (e.g., missing required TMF620 fields like `id` and `name`).

## H. Non-goals

This task strictly stops at Product Discovery. It explicitly does not implement:
- Order Management or Shopping Carts
- Product Subscriptions / Customer Products
- Local database synchronization of catalogue items
- Microservice event buses (Kafka, RabbitMQ)
