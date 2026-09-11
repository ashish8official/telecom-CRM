import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { CustomerAccount, AccountStatus, AccountLevel, ChangeCustomerAccountStatusInput } from '../../domain/customer_account/CustomerAccountTypes';
import { CustomerAccountNotFoundError, InvalidAccountStateTransitionError, AccountHasActiveChildrenError } from '../../domain/customer_account/CustomerAccountErrors';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { IIdempotencyManager } from '../../domain/common/idempotency/IIdempotencyManager';
import * as crypto from 'crypto';

export class ChangeCustomerAccountStatus {
    constructor(
        private accountRepo: ICustomerAccountRepository,
        private txManager: ITransactionManager,
        private idempotencyManager?: IIdempotencyManager
    ) {}

    private hashRequest(input: ChangeCustomerAccountStatusInput): string {
        return crypto.createHash('sha256').update(JSON.stringify({
            newStatus: input.newStatus,
            reasonCode: input.reasonCode
        })).digest('hex');
    }

    async execute(tenantId: string, accountId: string, input: ChangeCustomerAccountStatusInput, idempotencyKey?: string): Promise<CustomerAccount> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!accountId) throw new ValidationError("Account ID is required");
        if (!input.newStatus) throw new ValidationError("New status is required");
        if (!input.reasonCode) throw new ValidationError("Reason code is required");
        if (input.version === undefined) throw new ValidationError("Version is required for concurrency control");

        const operation = 'CHANGE_ACCOUNT_STATUS';
        const requestHash = this.hashRequest(input);

        const tx = await this.txManager.beginTransaction();
        try {
            if (idempotencyKey && this.idempotencyManager) {
                const existingRecord = await this.idempotencyManager.checkOrAcquire(
                    tenantId,
                    operation,
                    idempotencyKey,
                    requestHash,
                    tx
                );

                if (existingRecord) {
                    if (existingRecord.status === 'COMPLETED') {
                        await tx.commit();
                        return existingRecord.responsePayload as CustomerAccount;
                    }
                }
            }

            const account = await this.accountRepo.findAccountById(tenantId, accountId, tx);
            if (!account) {
                throw new CustomerAccountNotFoundError(accountId, tenantId);
            }

            this.validateTransition(account.status, input.newStatus);

            if (input.newStatus === AccountStatus.CLOSED && account.accountLevel === AccountLevel.MASTER) {
                const hasActiveChildren = await this.accountRepo.hasActiveChildren(tenantId, accountId, tx);
                if (hasActiveChildren) {
                    throw new AccountHasActiveChildrenError(accountId);
                }
            }

            const updatedAccount = await this.accountRepo.updateAccountStatus(
                tenantId,
                accountId,
                input.newStatus,
                input.version,
                input.updatedBy,
                tx
            );

            await this.accountRepo.insertStatusHistory(tenantId, {
                customerAccountId: accountId,
                previousStatus: account.status,
                newStatus: input.newStatus,
                reasonCode: input.reasonCode,
                reasonDescription: input.reasonDescription,
                changedBy: input.updatedBy
            }, tx);

            if (idempotencyKey && this.idempotencyManager) {
                await this.idempotencyManager.complete(
                    tenantId,
                    operation,
                    idempotencyKey,
                    'CustomerAccount',
                    accountId,
                    200,
                    updatedAccount,
                    tx
                );
            }

            await tx.commit();
            return updatedAccount;
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }

    private validateTransition(current: AccountStatus, next: AccountStatus) {
        if (current === next) {
            throw new InvalidAccountStateTransitionError(current, next);
        }

        if (current === AccountStatus.CLOSED) {
            throw new InvalidAccountStateTransitionError(current, next);
        }

        const validTransitions: Record<AccountStatus, AccountStatus[]> = {
            [AccountStatus.ACTIVE]: [AccountStatus.SUSPENDED, AccountStatus.CLOSED],
            [AccountStatus.SUSPENDED]: [AccountStatus.ACTIVE, AccountStatus.CLOSED],
            [AccountStatus.CLOSED]: []
        };

        const allowed = validTransitions[current];
        if (!allowed || !allowed.includes(next)) {
            throw new InvalidAccountStateTransitionError(current, next);
        }
    }
}
