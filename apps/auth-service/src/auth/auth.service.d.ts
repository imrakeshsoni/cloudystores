import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
interface Tenant {
    id: string;
    slug: string;
    status: string;
}
export declare class AuthService {
    private readonly usersService;
    private readonly jwtService;
    private readonly logger;
    constructor(usersService: UsersService, jwtService: JwtService);
    login(dto: LoginDto): Promise<void>;
    loginWithTenant(email: string, password: string, tenant: Tenant): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: any;
            name: string;
            email: string;
            tenantId: any;
        };
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }>;
    logout(userId: string): Promise<void>;
    private generateTokens;
}
export {};
