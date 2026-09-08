# CRM TASK 09.1: IDENTIFIER & IDEMPOTENCY REFINEMENT

## A. Identifier Model

The CRM strictly distinguishes between technical identities, business identities, and telecom identities:

```text
subscriber.id
      ↓
Technical identity (UUID). Used for database relationships and referential integrity.

subscriber.subscriber_code
      ↓
Business identity (e.g. SUB-A1B2C3D4). Used by CSR, operations, support, and external business references.

MSISDN / IMSI / ICCID
      ↓
Telecom/service identities. These are explicitly NOT the business identity.
```

### Why Subscriber Code Exists
The `subscriber_code` remains stable even if telecom identifiers change (e.g., SIM swaps, MSISDN changes). It is generated securely via `crypto.randomBytes` on creation and is immutable. It is never derived from mutable attributes.

## B. Idempotency Infrastructure

Idempotency metadata is no longer stored on the `subscriber` table. It has been moved to a reusable generic request/command processing infrastructure table (`idempotency_record`).

### Why the Separation?
```text
subscriber_code
```
Belongs to the Subscriber Domain. It is the business identity of the Subscriber.

```text
idempotency_key
```
Belongs to the Request Processing Layer. It identifies an HTTP *command* to prevent duplicate side effects.

### How it Works
When a request with an `Idempotency-Key` arrives:
1. We hash the material request payload.
2. We attempt to acquire a lock by inserting a record into `idempotency_record` with `IN_PROGRESS` status inside the database transaction.
3. If the insert violates the `(tenant_id, operation, idempotency_key)` unique constraint (handled safely via `ON CONFLICT DO NOTHING`), we read the existing record.
4. If the existing record is `COMPLETED`, we simply return the stored `response_payload` (the previously created Subscriber). The underlying application code (e.g., Subscriber creation) does not execute again.

### Payload Hash Validation
If the client accidentally reuses the same `Idempotency-Key` for a *different* request payload, the hashes will mismatch. The system will throw an `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST` error to prevent catastrophic data mixing.

### Concurrency
If two identical requests arrive simultaneously:
- Both attempt to insert the `idempotency_record`.
- Only one succeeds due to database-level unique constraints.
- The other reads the lock, sees `IN_PROGRESS`, and aborts with `IDEMPOTENCY_REQUEST_IN_PROGRESS`.
- Exactly *one* Subscriber is created.

## C. Architectural Boundary

```text
┌─────────────────────────────────────┐
│          Subscriber Domain          │
│                                     │
│ UUID                                │
│ Subscriber Code                     │
│ Customer Relationship               │
│ Account Relationship                │
│ Service Identity                    │
└──────────────────┬──────────────────┘
                   │
                   │ separate concern
                   ▼
┌─────────────────────────────────────┐
│      Request Processing Layer       │
│                                     │
│ Idempotency-Key                     │
│ Request Hash                        │
│ Operation Status                    │
│ Stored Command Result               │
└─────────────────────────────────────┘
```
