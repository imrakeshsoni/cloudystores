import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
export declare class AuthController {
    private readonly authService;
    private readonly dataSource;
    constructor(authService: AuthService, dataSource: DataSource);
    login(dto: LoginDto): Promise<any>;
    refresh(dto: RefreshTokenDto): Promise<any>;
    logout(req: any): Promise<void>;
    health(): any;
}
