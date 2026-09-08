# CRM TASK 08: GEOGRAPHIC & MARKET CONTEXT CONTRACT

## A. Problem Statement
In a globally deployable multi-country Telecom BSS architecture, commercial boundaries often do not map 1:1 with geographic boundaries, language boundaries, or operational boundaries. 

The architecture must explicitly reject the anti-pattern where a single "Country" entity dictates the entire context:
`Country ≠ Market ≠ Language ≠ Currency ≠ Timezone ≠ Tax Rule`

A system that assumes all these are identical will fail when:
- An operator defines distinct commercial markets within the same country (e.g., urban vs. rural pricing).
- A country spans multiple timezones.
- Customers in the same market prefer different languages.
- Cross-border enterprise customers manage accounts across different tax jurisdictions.

## B. Ownership Matrix

To maintain independently deployable systems (CRM vs. Product Catalogue), we must enforce strict domain boundaries. CRM is responsible for recording **Customer Facts**, while the Product Catalogue evaluates **Commercial Rules**.

| Concept | Owner | Description |
| :--- | :--- | :--- |
| **Customer Address** | **CRM** | Factual addresses (billing, contact, residential) where the customer is located. |
| **Customer Language Preference** | **CRM** | The communication language preference of the customer (e.g., `fr-CM`). Not tied to a market. |
| **Service Location Fact** | **CRM / Subscriber** | The physical location where a service is installed or provisioned. |
| **Geographic Master Hierarchy** | **Future Shared Reference Data** | A centralized geographical mapping (Country > Region > City). CRM uses flexible identifiers instead of a hardcoded schema. |
| **Commercial Market** | **Product Catalogue** | The abstract commercial construct defined by the business (e.g., `market_master` in Catalogue). |
| **Product Geographic Eligibility** | **Product Catalogue** | Rules defining whether a product can be sold in a specific geographic or commercial context. |
| **Product Pricing** | **Product Catalogue / Billing** | The financial charge calculation based on market and rate plans. |
| **Currency Conversion** | **Financial Domain** | Currency exchange rules and conversion logic. |
| **Tax Calculation** | **Billing / Tax Domain** | Tax rules, VAT application, exemptions. |

## C. Integration Flow

CRM systems provide the factual state. Catalogue systems answer whether products can be sold to that state.
The CRM internal model remains isolated from specific Product Catalogue implementations (like TM Forum Open APIs or Vendor APIs) through an Anti-Corruption Layer (ACL).

```text
                    CUSTOMER
                        │
                        ▼
                 CRM FACTUAL CONTEXT
                        │
              Geographic Facts (e.g., locationCode)
              Customer Preferences (e.g., preferredLanguage)
              Account Facts (e.g., accountLevel)
                        │
                        ▼
             CUSTOMER ELIGIBILITY CONTEXT
                        │
                        ▼
                CATALOGUE PORT (ACL)
                        │
                        ▼
             COMMERCIAL RULE EVALUATION (Catalogue)
                        │
                        ▼
               PRODUCT CATALOGUE
```

## D. Identifier Strategy

To prevent physical database coupling, CRM and the Product Catalogue do not share foreign keys or database tables.

Instead, they communicate using **Stable Identifiers**.
- The existing Product Catalogue uses `market_code` inside its `market_master` table.
- The CRM will represent geographic facts using `GeographicLocationReference`, storing stable strings like `locationCode` or `countryCode`.
- When CRM requests eligibility from the Catalogue Adapter, it passes the context (e.g., `{ geographic: { code: 'CM-CE', level: 'REGION' } }`). 
- The Catalogue Adapter or the Catalogue itself is responsible for mapping that `locationCode` to its internal `market_code`.

### Handling Optional Context
Geographic context is treated as optional (`geographic?: GeographicLocationReference`). This supports progressive enrichment:
1. **Lead/Prospect:** No service location known yet.
2. **New Customer:** Billing address provided, but no active service lines.
3. **Subscriber:** Granular physical service location is known.

By keeping it optional, we avoid requiring dummy location data at early stages of the customer lifecycle.

## E. Future Evolution
By abstracting geographic location facts into string references (`code`, `level`, `externalId`), the CRM is future-proofed against the introduction of a centralized Geographic Master Data Service. 

If the organization later builds a Centralized Reference Data Microservice:
- The CRM will not need database migrations because it does not have hardcoded `country_id`, `region_id` foreign keys.
- The CRM will simply fetch standard ISO/Administrative codes from the Master Data Service and attach them to the Customer/Subscriber facts.
- The Product Catalogue will map those same standard codes to its own internal commercial markets.

## F. Existing Product Catalogue Integration Gaps
During the review of the existing Product Catalogue (telecom-product-catalogue), the following integration gaps were identified and must be handled by the Catalogue Adapter layer:

1. **Market Mapping:** The Product Catalogue relies on `market_code` within its `market_master` table. CRM will emit a `GeographicLocationReference` (e.g., `code: 'CM-CE'`). The Adapter layer will need a translation mechanism to map the CRM's location codes to the Catalogue's `market_code` hierarchy.
2. **Timezone:** The Catalogue specifies `timezone` on the market level (validated against IANA format). CRM does not store a global timezone fact on the customer; therefore, any downstream process requiring a specific timezone calculation must resolve it either via the mapped Catalogue Market or a separate operational configuration, not by asking the core CRM domain.
3. **Currency:** The Catalogue enforces a `default_currency_code` per market. CRM's `CustomerEligibilityContext` does not (and should not) pass a currency, meaning the Catalogue must infer the appropriate currency from the resolved market during price evaluation.
