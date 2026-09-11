# CRM TASK 11: CUSTOMER 360 & AGGREGATION LAYER

## 1. Purpose
The **Customer 360** endpoint (`GET /customers/{customerId}/360`) provides a unified, read-only operational view of a telecom customer. It aggregates factual data owned by various internal CRM domains (Customer, Account, Subscriber, Party) and enriches it with commercial discovery information from an external Product Catalogue.

Customer 360 is an **aggregation layer**, not a new master domain. It does not duplicate data into new tables, nor does it assume ownership of the underlying entities.

## 2. Aggregation Architecture
The aggregation is orchestrated purely within the Application Layer (`Customer360UseCase`), keeping the HTTP Controller thin.

```text
                         ┌──────────────────────┐
                         │      CRM API         │
                         │ /customers/{id}/360  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   GetCustomer360     │
                         └──────────┬───────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
    Customer/Party             Accounts                  Subscribers
    Repositories               Repository                 Repository
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                         ┌──────────┴───────────┐
                         │                      │
                         ▼                      ▼
                Contact / Consent /      Geographic Context
                Preference Repositories
                         │
                         │
                         ▼
                  ┌───────────────┐
                  │ CataloguePort │
                  └───────┬───────┘
                          │
                          ▼
                   Catalogue ACL
                          │
                          ▼
                  External Catalogue
```

## 3. Domain Ownership
*   **Party & Customer Domain:** Owns demographic and relationship facts.
*   **Account Domain:** Owns account hierarchy, billing responsibility, and account lifecycle.
*   **Subscriber Domain:** Owns service instances and their operational state.
*   **Catalogue Domain:** Owns commercial Product Offerings, Prices, and Eligibility rules.

Customer 360 simply reads and composes this information into a normalized CRM response model.

## 4. Account and Subscriber Hierarchy
The response aggregates accounts and automatically resolves the billing responsibility for each account. 

### A. Simple Account Scenario
```text
Master Account (Billing Responsible)
   └── Subscriber A
```
*   **Direct Account:** Master Account
*   **Billing Account:** Master Account

### B. Hierarchical Account Scenario
```text
Master Account (Billing Responsible)
   └── Child Account (Not Billing Responsible)
          └── Subscriber B
```
*   **Direct Account:** Child Account
*   **Billing Account:** Master Account (Resolved dynamically in memory)

## 5. Contact, Consent, and Preferences
These domains do not currently have dedicated tables in the CRM. The Customer 360 API correctly returns these sections with a `status = NOT_IMPLEMENTED` (or an empty list) rather than inventing arbitrary communication preferences or breaking the contract.

## 6. Product Discovery Integration
Customer 360 interacts with the Product Catalogue exclusively via the `CataloguePort`. It uses the consolidated Customer/Account/Subscriber context to query for eligible offerings.

### Catalogue Failure Behavior (Graceful Degradation)
If the external Catalogue is unreachable (e.g., timeout, 503, circuit breaker open), the Customer 360 request **does not fail**. Instead, the `productDiscovery` component is explicitly marked as `status = UNAVAILABLE`. This ensures that CSRs can still view the customer's accounts and subscribers even if the catalogue is down.

### Partial Success Semantics
The response model employs an explicit component-status wrapper (`ComponentStatus<T>`).
```json
{
  "customer": { "status": "SUCCESS", "data": { ... } },
  "accounts": { "status": "SUCCESS", "data": [ ... ] },
  "productDiscovery": { "status": "UNAVAILABLE", "data": null }
}
```

## 7. Performance and N+1 Avoidance
Customer 360 uses batched retrieval to prevent N+1 database queries.
*   It fetches all Accounts for a Customer in one query.
*   It fetches all Subscribers for those Accounts using an `IN (...)` clause in a single query.
*   Billing account resolution executes purely in-memory using the retrieved account list.
*   Product discovery builds a unified context to prevent issuing a Catalogue HTTP request per subscriber.

## 8. Tenant Isolation & Security
All queries are strongly tenant-bound. A tenant mismatch immediately halts execution and returns a `CustomerNotFoundError` to prevent cross-tenant data leaks. Internal database IDs and audit metadata are excluded from the final response where possible.

## 9. Explicit Non-Goals
Customer 360 does **not**:
*   Execute orders or mutate state.
*   Calculate taxes, invoice totals, or recalculate prices.
*   Translate catalogue language terms natively.
*   Provide a Distributed Transaction context.
