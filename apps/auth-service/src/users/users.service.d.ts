import { Repository, DataSource } from 'typeorm';
import { User } from './user.entity';
export declare class UsersService {
    private readonly repo;
    private readonly dataSource;
    constructor(repo: Repository<User>, dataSource: DataSource);
    findByEmailAndTenant(email: string, tenantId: string): Promise<User | null>;
    findById(id: string): Promise<User>;
    findWithPermissions(userId: string): Promise<User & {
        permissions: any;
    }>;
    updateLastLogin(id: string): Promise<void>;
    updateRefreshToken(id: string, token: string | null): Promise<void>;
    validateRefreshToken(id: string, token: string): Promise<boolean>;
}
