import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';

interface Tenant {
  id: string;
  slug: string;
  status: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    // Resolve tenant by slug (injected via DataSource in a real setup)
    // For clarity, the tenant lookup is done via raw query in the controller/resolver
    throw new Error('Use loginWithTenant instead');
  }

  async loginWithTenant(email: string, password: string, tenant: Tenant) {
    if (tenant.status === 'suspended') {
      throw new UnauthorizedException('Account suspended. Contact support.');
    }

    const user = await this.usersService.findByEmailAndTenant(email, tenant.id);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    const { accessToken, refreshToken } = await this.generateTokens(user, tenant);

    await this.usersService.updateRefreshToken(user.id, refreshToken, tenant.id);
    await this.usersService.updateLastLogin(user.id, tenant.id);

    this.logger.log(`User ${user.email} logged in (tenant: ${tenant.slug})`);

    return {
      accessToken,
      refreshToken,
      expiresIn: Number(process.env.JWT_EXPIRY ?? 3600),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId,
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const valid = await this.usersService.validateRefreshToken(
      payload.sub,
      dto.refreshToken,
      payload.tenantId,
    );
    if (!valid) throw new UnauthorizedException('Refresh token revoked');

    const user = await this.usersService.findWithPermissions(payload.sub, payload.tenantId);
    const tenant = { id: user.tenantId, slug: payload.tenantSlug, status: 'active' } as Tenant;

    const { accessToken, refreshToken } = await this.generateTokens(user, tenant);
    await this.usersService.updateRefreshToken(user.id, refreshToken, user.tenantId);

    return { accessToken, refreshToken, expiresIn: Number(process.env.JWT_EXPIRY ?? 3600) };
  }

  async logout(userId: string, tenantId: string): Promise<void> {
    await this.usersService.updateRefreshToken(userId, null, tenantId);
  }

  private async generateTokens(user: any, tenant: Tenant) {
    const userWithPerms = await this.usersService.findWithPermissions(user.id, tenant.id);
    const accessExpiry = Number(process.env.JWT_EXPIRY ?? 3600);
    const refreshExpiry = Number(process.env.JWT_REFRESH_EXPIRY ?? 604800);

    const jwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      tenantSlug: tenant.slug,
      shopId: user.shopId,
      profileId: user.profileId,
      roleId: user.roleId,
      isPlatformAdmin: user.isPlatformAdmin,
      permissions: userWithPerms.permissions ?? {},
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: process.env.JWT_SECRET,
        expiresIn: accessExpiry,
      }),
      this.jwtService.signAsync(
        { sub: user.id, tenantId: tenant.id, tenantSlug: tenant.slug },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: refreshExpiry,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
