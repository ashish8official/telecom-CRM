export interface ITransaction {
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
    // Internal driver-specific object, intentionally kept any/unknown in base interface to avoid exposing driver specifics
    getConnection(): any; 
}
