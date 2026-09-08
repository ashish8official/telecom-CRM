import { ITransaction } from './ITransaction';

export interface ITransactionManager {
    beginTransaction(): Promise<ITransaction>;
}
