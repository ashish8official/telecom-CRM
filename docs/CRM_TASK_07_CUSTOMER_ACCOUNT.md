# CRM Customer Account Domain (Task 07)

This document outlines the architecture, constraints, and implementation of the Customer Account domain vertical slice.

## 1. Domain Semantic Boundaries

As per the Telecom CRM architecture:
* **Party:** Who the real-world entity is.
* **Customer:** The commercial relationship between the Party and the Telecom operator.
* **Customer Account:** How the Customer organizes their billing and future subscriber hierarchies.

> **Important Boundary:** The Customer Account does *not* contain service-specific classifications (e.g., *GSM PREPAID*, *M2M POSTPAID*). Those are subscriber/product contexts. The Customer Account domain remains generic and structural.

## 2. Account Hierarchy Rules

The system supports a hierarchical structure composed of:
1. **MASTER Account:** The top-level account. It has no parent. It holds the `billing_responsible_flag = true`.
2. **CHILD Account:** A subordinate account. It must have a MASTER parent. It holds the `billing_responsible_flag = false`.

### Integrity Constraints (Enforced at DB level):
* **Tenant Isolation:** A child account cannot belong to a parent from a different tenant (`composite foreign keys`).
* **Level/Billing Consistency:** A CHECK constraint enforces that `MASTER` accounts must not have parents and must be billing responsible. `CHILD` accounts must have parents and must *not* be billing responsible.
* **No Self-Parenting:** Enforced via `CHECK (parent_account_id <> id)`.

### Integrity Constraints (Enforced at Application level):
* **Customer Ownership:** A Child Account must belong to the same Customer as its Parent Master Account. Cross-customer hierarchies are explicitly blocked (`CrossCustomerAccountHierarchyError`).
* **Cycle Prevention:** A cycle is impossible by design in Phase 1 because `parent_account_id` is strictly immutable upon creation, and must point to an *existing* MASTER account.

## 3. Account Lifecycle

Accounts transition through: `ACTIVE` → `SUSPENDED` → `CLOSED`.
* **Closing Master Accounts:** A Master account cannot be `CLOSED` if it has any active or suspended Child accounts (`AccountHasActiveChildrenError`). The application specifically validates this rule during the transition.
* **Parent Requisite:** A Child account can only be created if its Parent Master account is `ACTIVE`.

## 4. Application Layer Use Cases

* **`CreateMasterAccount`**: Validates the Customer, and automatically establishes the account as `MASTER` with `billing_responsible = true`.
* **`CreateChildAccount`**: Validates the Customer, validates the Parent (exists, same tenant, same customer, is `MASTER`, is `ACTIVE`), and creates the `CHILD` account.
* **`GetCustomerAccountHierarchy`**: A specialized retrieval use-case that fetches all accounts for a Customer and constructs the `MASTER -> [CHILDREN]` tree in memory efficiently (no N+1 queries).
* **`ChangeCustomerAccountStatus`**: Dedicated use-case managing lifecycle progression and enforcing the "no active children when closing master" rule.
* **`UpdateCustomerAccount`**: Only permits modifying `effectiveTo`. Identifiers and hierarchy linkages (`customer_id`, `parent_account_id`, `account_level`) are explicitly immutable.

## 5. Testing

The layer has been rigorously tested using both Mock Repositories and live PostgreSQL instances:
* **Unit Tests:** Validated use cases, transition rules, cross-customer hierarchy prevention, and temporal validation (`effectiveTo >= effectiveFrom`).
* **Integration Tests:** Guaranteed that the composite foreign keys correctly block cross-tenant relationships, and that check constraints effectively block invalid Master/Child combinations or self-parenting attempts at the physical level.

## 6. Known Limitations (Phase 1)
* **Account Re-parenting:** Hierarchy mutation (changing a child's parent) is currently OUT OF SCOPE. `parent_account_id` is immutable.
* **No Cascading Lifecycle Updates:** Suspending a Master account does *not* automatically suspend its children.
* **Subscriber Implementation:** Subscribers are not yet implemented. They will attach to Customer Accounts in Task 08.
* **No REST APIs:** Application endpoints, JWT decoding, and Express servers will be built in a later phase.
