import { Controller, Post, Body, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { successResponse } from '@shoposphere/common';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: OnboardTenantDto) {
    const result = await this.onboardingService.onboard(dto);
    return successResponse(result);
  }

  // Check if a slug is available (used by frontend during signup)
  @Get('slug-check/:name')
  async checkSlug(@Param('name') name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const [existing] = await (this.onboardingService as any).dataSource.query(
      `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    return successResponse({ slug, available: !existing });
  }
}
