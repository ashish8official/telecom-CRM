import { ITransaction } from '../common/transaction/ITransaction';
import { CreateSubscriberInput, Subscriber, SubscriberStatusHistory } from './SubscriberTypes';

export interface ISubscriberRepository {
    createSubscriber(tenantId: string, data: CreateSubscriberInput, tx?: ITransaction): Promise<Subscriber>;
    getSubscriber(tenantId: string, subscriberId: string, tx?: ITransaction): Promise<Subscriber | null>;
    getSubscriberByCode(tenantId: string, subscriberCode: string, tx?: ITransaction): Promise<Subscriber | null>;
    getSubscriberByIdempotencyKey(tenantId: string, idempotencyKey: string, tx?: ITransaction): Promise<Subscriber | null>;
    updateSubscriberStatus(
        tenantId: string, 
        subscriberId: string, 
        newStatus: string, 
        version: number, 
        updatedBy?: string, 
        tx?: ITransaction
    ): Promise<Subscriber>;
    insertStatusHistory(tenantId: string, data: Omit<SubscriberStatusHistory, 'id' | 'tenantId' | 'changedAt'>, tx?: ITransaction): Promise<SubscriberStatusHistory>;
}
