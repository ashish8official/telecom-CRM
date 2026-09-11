# Task 12 — Customer, Account & Subscriber Lifecycle Management

## Overview
Implemented an enterprise-grade lifecycle state management module for `Customer`, `CustomerAccount`, and `Subscriber` entities. This provides strict concurrency control, idempotency, audit trails, and transition logic.

## Changes Made

### 1. Database Migrations
- Created `013_lifecycle_infrastructure.sql`.
- Added `version INT NOT NULL DEFAULT 1` to `customer` and `customer_account` for optimistic locking.
- Created `customer_status_history` and `customer_account_status_history` tables for tracking explicit audit trails.

### 2. Domain & Repositories
- Updated `Customer` and `CustomerAccount` Domain Types with `version` and `History` representations.
- Added `updateCustomerStatus`, `updateAccountStatus`, and `insertStatusHistory` to PostgreSQL Repositories.
- Added `tx: ITransaction` parameters to ensure operations occur fully atomically.

### 3. Application Use Cases
Refactored the three core lifecycle use cases (`ChangeCustomerStatus.ts`, `ChangeCustomerAccountStatus.ts`, `ChangeSubscriberStatus.ts`) to:
- Use `ITransactionManager` to wrap state updates and history insertions in a single atomic commit.
- Use `IIdempotencyManager` to catch duplicate `Idempotency-Key` headers and return cached payload without failing or re-executing.
- Require `version` for optimistic lock concurrency checks against the database (`version = version + 1 WHERE version = $5`).
- Ensure no unexpected cascade operations (e.g., closing a Master account with active Child accounts now actively rejects via `AccountHasActiveChildrenError`).

### 4. API Controllers
- Created `CustomerLifecycleController.ts`
- Created `CustomerAccountLifecycleController.ts`
- Created `SubscriberLifecycleController.ts`
- Standardized controllers to map incoming `req.headers['idempotency-key']`, `req.headers['x-tenant-id']`, and route parameters into the application use cases, safely capturing and translating domain errors (`InvalidTransition`, `HasActiveChildren`, etc.) to proper HTTP 400/409 codes.

## Testing & Validation
- Fully updated `customer_db.test.ts` and `customer_account_db.test.ts` to respect the newly strict API boundaries (explicit tx passing, mocked idempotency inputs).
- Wrote full E2E Integration tests in `lifecycle.test.ts` to simulate entire lifecycles across entities, successfully validating all new transition matrices.
- 30 / 30 integration tests pass cleanly. `npx tsc --noEmit` validates without issue.
