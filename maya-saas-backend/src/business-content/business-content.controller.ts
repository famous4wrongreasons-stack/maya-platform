import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { BusinessContentService } from './business-content.service';
import {
  IngestBusinessReviewDto,
  ReviewQueryDto,
} from './dto/business-review.dto';
import {
  ListCatalogQueryDto,
  UpsertCatalogItemDto,
} from './dto/catalog-item.dto';
import { UpdateReferralProgramDto } from './dto/referral-program.dto';

const BUSINESS_CONTENT_READ_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
] as const;

const CUSTOMER_CONTENT_READ_ROLES = [
  ...BUSINESS_CONTENT_READ_ROLES,
  UserRole.CUSTOMER,
  UserRole.CLIENT,
] as const;

const BUSINESS_CONTENT_WRITE_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
] as const;

@ApiTags('business content')
@ApiBearerAuth()
@TenantScoped()
@Controller('business-content')
export class BusinessContentController {
  constructor(private readonly service: BusinessContentService) {}

  @Get('inventory')
  @Roles(...BUSINESS_CONTENT_READ_ROLES)
  @RequiresFeature('commerce.store')
  @ApiOperation({ summary: 'Read tenant inventory and low-stock signals' })
  inventory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCatalogQueryDto,
  ) {
    return this.service.listCatalog(user.tenantId!, 'inventory', {
      activeOnly: query.includeInactive ? false : true,
      lowStockOnly: query.lowStockOnly,
    });
  }

  @Post('inventory')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.store')
  createInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCatalogItemDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createCatalogItem(
      user.tenantId!,
      user.userId,
      'inventory',
      dto,
      idempotencyKey,
    );
  }

  @Put('inventory/:itemId')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.store')
  updateInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpsertCatalogItemDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.updateCatalogItem(
      user.tenantId!,
      user.userId,
      'inventory',
      itemId,
      dto,
      idempotencyKey,
    );
  }

  @Delete('inventory/:itemId')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.store')
  deleteInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.deleteCatalogItem(
      user.tenantId!,
      user.userId,
      'inventory',
      itemId,
      idempotencyKey,
    );
  }

  @Get('certificates')
  @Roles(...CUSTOMER_CONTENT_READ_ROLES)
  @RequiresFeature('commerce.certificates')
  certificates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCatalogQueryDto,
  ) {
    return this.service.listCatalog(user.tenantId!, 'certificate', {
      activeOnly: query.includeInactive ? false : true,
    });
  }

  @Post('certificates')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.certificates')
  createCertificate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCatalogItemDto,
  ) {
    return this.service.createCatalogItem(
      user.tenantId!,
      user.userId,
      'certificate',
      dto,
    );
  }

  @Put('certificates/:itemId')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.certificates')
  updateCertificate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpsertCatalogItemDto,
  ) {
    return this.service.updateCatalogItem(
      user.tenantId!,
      user.userId,
      'certificate',
      itemId,
      dto,
    );
  }

  @Delete('certificates/:itemId')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.certificates')
  deleteCertificate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.service.deleteCatalogItem(
      user.tenantId!,
      user.userId,
      'certificate',
      itemId,
    );
  }

  @Get('memberships')
  @Roles(...CUSTOMER_CONTENT_READ_ROLES)
  @RequiresFeature('commerce.memberships')
  memberships(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCatalogQueryDto,
  ) {
    return this.service.listCatalog(user.tenantId!, 'membership', {
      activeOnly: query.includeInactive ? false : true,
    });
  }

  @Post('memberships')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.memberships')
  createMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCatalogItemDto,
  ) {
    return this.service.createCatalogItem(
      user.tenantId!,
      user.userId,
      'membership',
      dto,
    );
  }

  @Put('memberships/:itemId')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.memberships')
  updateMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpsertCatalogItemDto,
  ) {
    return this.service.updateCatalogItem(
      user.tenantId!,
      user.userId,
      'membership',
      itemId,
      dto,
    );
  }

  @Delete('memberships/:itemId')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('commerce.memberships')
  deleteMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.service.deleteCatalogItem(
      user.tenantId!,
      user.userId,
      'membership',
      itemId,
    );
  }

  @Get('referrals')
  @Roles(...CUSTOMER_CONTENT_READ_ROLES)
  @RequiresFeature('referrals')
  referrals(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getReferralProgram(user.tenantId!);
  }

  @Put('referrals')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('referrals')
  updateReferrals(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateReferralProgramDto,
  ) {
    return this.service.updateReferralProgram(user.tenantId!, user.userId, dto);
  }

  @Get('reviews')
  @Roles(...BUSINESS_CONTENT_READ_ROLES)
  @RequiresFeature('reviews.core')
  reviews(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReviewQueryDto,
  ) {
    return this.service.listReviews(user.tenantId!, query);
  }

  @Post('reviews')
  @Roles(...BUSINESS_CONTENT_WRITE_ROLES)
  @RequiresFeature('reviews.core')
  ingestReview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IngestBusinessReviewDto,
  ) {
    return this.service.ingestReview(user.tenantId!, user.userId, dto);
  }

  @Get('reviews/topics')
  @Roles(...BUSINESS_CONTENT_READ_ROLES)
  @RequiresFeature('reviews.core')
  reviewTopics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReviewQueryDto,
  ) {
    return this.service.analyzeReviews(user.tenantId!, query);
  }

  @Get('reviews/trend')
  @Roles(...BUSINESS_CONTENT_READ_ROLES)
  @RequiresFeature('reviews.core')
  reviewTrend(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReviewQueryDto,
  ) {
    return this.service.reviewTrend(user.tenantId!, query);
  }
}
