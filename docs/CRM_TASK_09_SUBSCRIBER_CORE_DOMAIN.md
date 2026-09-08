# CRM TASK 09: TELECOM SUBSCRIBER CORE DOMAIN

## A. Domain Definitions

To build a rigorous and extensible BSS architecture, the CRM distinctly models:
* **Party:** The physical person or legal organization (e.g., John Doe).
* **Customer:** The commercial relationship between the Party and the Telecom Operator.
* **Customer Account:** The billing and hierarchical structural entity (Master/Child).
* **Subscriber:** The logical telecom service instance associated directly with an Account.

**Crucial Distinction:** A Subscriber is NOT a telecom resource. It represents the *subscription to a service* (Who, What, Under what terms).

## B. Account Relationship Model

The Subscriber domain enforces that every Subscriber belongs directly to exactly one `CustomerAccount`. To support enterprise and consumer flexibility, we support the following topologies without requiring artificial accounts:

1. **One Master Account → One Subscriber**
   * **Direct Account:** Master Account
   * **Billing Account:** Master Account
2. **One Master Account → Multiple Subscribers**
   * **Direct Account:** Master Account
   * **Billing Account:** Master Account (Child accounts are not forced simply to hold a subscriber).
3. **Master Account → Child Account → Subscriber**
   * **Direct Account:** Child Account
   * **Billing Account:** Resolves to the Master Account via parent hierarchy.

## C. Why Subscriber Is Not a Telecom Resource

A Subscriber is entirely decoupled from physical/network assets like:
* **MSISDN (Phone Number)**
* **SIM / eSIM**
* **IMSI / ICCID**

**Reasoning:** A subscriber identity (e.g., the service contract) outlives hardware changes. If a user loses their SIM card, we perform a "SIM Swap"—we do NOT terminate the Subscriber and create a new one. Telecom inventory management is explicitly pushed to a separate domain to preserve CRM commercial purity.

## D. Service Classification

We classify a Subscriber via two distinct dimensions rather than hardcoding permutations:
* **Service Category:** Defines the technology/nature of service (`GSM`, `M2M`, `FWA`, `INTERSAT`, `FTTH`, etc.)
* **Service Mode:** Defines the payment relationship (`PREPAID`, `POSTPAID`, `HYBRID`)

This matrix allows for `GSM PREPAID` and `M2M POSTPAID` to share a unified Subscriber entity schema seamlessly without schema alterations.

## E. Lifecycle

The CRM owns the logical commercial state of the Subscriber. The minimal, enforced lifecycle is:
* `PENDING`: Created, but not yet provisioned or active.
* `ACTIVE`: Service is commercially live.
* `SUSPENDED`: Temporarily halted (e.g., low balance, fraud check).
* `BARRED`: Stronger suspension (e.g., lost device, legal intercept).
* `DISCONNECTED`: Service terminated gracefully.
* `TERMINATED`: Final state.

**Invalid Transitions Rejected:** e.g., `DISCONNECTED` cannot go back to `ACTIVE` directly without an explicit process.

## F. Billing Account Resolution

As implemented in `ResolveSubscriberBillingAccount.ts`, if the Subscriber's direct account is not `billing_responsible_flag = true` (i.e. it's a Child Account), the system safely traverses the parent hierarchy until it locates the Master Account.

## G. Tenant Isolation

All queries and commands (`createSubscriber`, `getSubscriber`, `updateSubscriberStatus`) enforce `tenant_id` compositely. Cross-tenant access is explicitly rejected at the Postgres repository layer (`WHERE tenant_id = $1 AND id = $2`).

## H. Concurrency

Optimistic Locking is implemented via a `version` column. 
* A `version` number is passed during `updateSubscriberStatus`. 
* The repository executes `UPDATE ... WHERE id = $1 AND version = $2`.
* If 0 rows are affected, a `ConcurrentModificationError` (HTTP 409) is thrown, preventing lost updates (e.g., Admin A suspending while Admin B disconnects).

## I. Idempotency

Subscriber creation implements an optional `idempotencyKey` per tenant.
* Evaluated before the transaction begins: If `idempotencyKey` exists in the database, the system safely returns the existing Subscriber without throwing an error or duplicating the record. This protects against automated upstream retry storms (e.g., from an Order Management system).

## J. Geographic Context

Aligning with Task 08, the Subscriber schema implements optional Service Location References:
* `location_level`
* `location_code`
* `location_external_id`

This ensures full contextual interoperability with the Product Catalogue rules engine without duplicating market logic in CRM.

## K. Explicit Non-Goals

This core domain explicitly deferred:
* Network Provisioning & HLR/HSS API integrations.
* Physical Resource Inventory (SIM, MSISDN).
* Product Offering assignment and Pricing.
* Charging/Billing engine executions. 

These will be integrated via loosely-coupled event mechanisms or orchestrators in upcoming phases.
