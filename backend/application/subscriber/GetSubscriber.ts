import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { Subscriber } from '../../domain/subscriber/SubscriberTypes';

export class GetSubscriber {
    constructor(private repo: ISubscriberRepository) {}

    async execute(tenantId: string, subscriberId: string): Promise<Subscriber | null> {
        return await this.repo.getSubscriber(tenantId, subscriberId);
    }
}
