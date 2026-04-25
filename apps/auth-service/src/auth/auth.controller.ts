import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Request,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { successResponse } from '@shoposphere/common';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto) {
    const [tenant] = await this.dataSource.query(
      `SELECT id, slug, status FROM tenants WHERE slug = $1 LIMIT 1`,
      [dto.tenantSlug],
    );

    if (!tenant) {
      // Return same error as bad credentials to prevent tenant enumeration
      throw new UnauthorizedException('Invalid credentials');
    }

    const result = await this.authService.loginWithTenant(
      dto.email,
      dto.password,
      tenant,
    );

    return successResponse(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refresh(dto);
    return successResponse(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Request() req: any) {
    if (req.user?.sub) {
      await this.authService.logout(req.user.sub, req.user.tenantId);
    }
  }

  // Health check (also useful for token validation by other services)
  @Get('health')
  health() {
    return successResponse({ status: 'ok', service: 'auth' });
  }
}
