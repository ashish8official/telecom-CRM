import { ITransaction } from '../../domain/party/PartyRepository';

export interface ITransactionManager {
    beginTransaction(): Promise<ITransaction>;
}
