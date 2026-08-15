import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { resolveAuthClientMetadata } from './auth-client-metadata';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { TelegramPhoneLinkService } from './telegram-phone-link.service';
import { CompleteTelegramPhoneLinkDto } from './dto/complete-telegram-phone-link.dto';
import { CompleteOauthLoginDto } from './dto/complete-oauth-login.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterDto } from './dto/register.dto';
import { StartEmailAuthDto } from './dto/start-email-auth.dto';
import { StartPhoneAuthDto } from './dto/start-phone-auth.dto';
import { StartOauthLoginDto } from './dto/start-oauth-login.dto';
import { VerifyEmailAuthDto } from './dto/verify-email-auth.dto';
import { VerifyPhoneAuthDto } from './dto/verify-phone-auth.dto';
import { EmailAuthService } from './email-auth.service';
import { SocialAuthService } from './social-auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly telegramPhoneLinkService: TelegramPhoneLinkService,
    private readonly emailAuthService: EmailAuthService,
    private readonly socialAuthService: SocialAuthService,
    private readonly sessionService: AuthSessionService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate a user and return a JWT' })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, resolveAuthClientMetadata(request));
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a tenant-scoped client user' })
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register(dto, resolveAuthClientMetadata(request));
  }

  @Public()
  @Post('phone/start')
  @ApiOperation({
    summary: 'Start phone-first client auth and send a verification code',
  })
  startPhoneAuth(@Body() dto: StartPhoneAuthDto, @Req() request: Request) {
    return this.authService.startPhoneAuth(
      dto,
      resolveAuthClientMetadata(request).clientIp,
    );
  }

  @Public()
  @Post('phone/verify')
  @ApiOperation({
    summary: 'Verify a phone auth code and return a tenant-scoped JWT',
  })
  verifyPhoneAuth(@Body() dto: VerifyPhoneAuthDto, @Req() request: Request) {
    return this.authService.verifyPhoneAuth(
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  @Post('email/start')
  @ApiOperation({
    summary:
      'Send a one-time email code, optionally discovering the tenant after verification',
  })
  startEmailAuth(@Body() dto: StartEmailAuthDto, @Req() request: Request) {
    return this.emailAuthService.start(dto, resolveAuthClientMetadata(request));
  }

  @Public()
  @Post('email/verify')
  @ApiOperation({
    summary:
      'Verify an email code, resolve the business and return a tenant-scoped JWT',
  })
  verifyEmailAuth(@Body() dto: VerifyEmailAuthDto, @Req() request: Request) {
    return this.emailAuthService.verify(
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  @Post('oauth/yandex/start')
  @ApiOperation({
    summary: 'Start Yandex ID login for a tenant-scoped user',
  })
  startYandexLogin(@Body() dto: StartOauthLoginDto, @Req() request: Request) {
    return this.socialAuthService.startYandexLogin(
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  @Post('oauth/yandex/complete')
  @ApiOperation({
    summary: 'Complete Yandex ID login and return a tenant-scoped JWT',
  })
  completeYandexLogin(
    @Body() dto: CompleteOauthLoginDto,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeYandexLogin(
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Post('oauth/yandex/link/complete')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link Yandex ID to the authenticated business account',
  })
  completeYandexLink(
    @Body() dto: CompleteOauthLoginDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeYandexLink(
      dto,
      user,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  /**
   * Номер телефона через платформенного бота: приложение получает ссылку,
   * человек жмёт в боте одну кнопку. Без SMS и без ввода номера руками —
   * иначе чужие бонусы и визиты открывались бы всякому, кто знает номер.
   */
  @Post('telegram/phone-link/start')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a one-time Telegram deep link that confirms the phone',
  })
  startTelegramPhoneLink(@CurrentUser() user: AuthenticatedUser) {
    return this.telegramPhoneLinkService.start(user.tenantId!, user.userId);
  }

  /** Ручка для бота, не для приложения: защищена общим секретом. */
  @Public()
  @Post('telegram/phone-link/complete')
  @ApiOperation({
    summary: 'Bot callback: attach the Telegram-confirmed phone to the user',
  })
  completeTelegramPhoneLink(
    @Body() dto: CompleteTelegramPhoneLinkDto,
    @Req() request: Request,
  ) {
    return this.telegramPhoneLinkService.complete({
      sharedSecret: String(request.headers['x-maya-platform-bot'] ?? ''),
      code: dto.code,
      phone: dto.phone,
    });
  }

  @Post('oauth/telegram/start')
  @ApiOperation({
    summary: 'Start Telegram login for a tenant-scoped user',
  })
  startTelegramLogin(@Body() dto: StartOauthLoginDto, @Req() request: Request) {
    return this.socialAuthService.startTelegramLogin(
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Public()
  @Post('oauth/telegram/complete')
  @ApiOperation({
    summary: 'Complete Telegram login and return a tenant-scoped JWT',
  })
  completeTelegramLogin(
    @Body() dto: CompleteOauthLoginDto,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeTelegramLogin(
      dto,
      resolveAuthClientMetadata(request),
    );
  }

  @Post('oauth/telegram/link/complete')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link Telegram to the authenticated business account',
  })
  completeTelegramLink(
    @Body() dto: CompleteOauthLoginDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.socialAuthService.completeTelegramLink(
      dto,
      user,
      resolveAuthClientMetadata(request),
    );
  }

  @Get('oauth/links')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List social sign-in methods linked to this user' })
  listOauthLinks(@CurrentUser() user: AuthenticatedUser) {
    return this.socialAuthService.listLinkedIdentities(user);
  }

  @Public()
  @Get('oauth/native/callback')
  @ApiOperation({
    summary: 'Return a social login result to the native MAYA OS application',
  })
  nativeOauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() response: Response,
  ) {
    return response.redirect(
      302,
      this.socialAuthService.buildNativeCallbackUrl({
        code,
        state,
        error,
        errorDescription,
      }),
    );
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a one-time refresh token' })
  refresh(@Body() dto: RefreshSessionDto, @Req() request: Request) {
    return this.sessionService.refresh(
      dto.refreshToken,
      resolveAuthClientMetadata(request),
    );
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current authenticated session' })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionService.logout(user);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List sessions for the current user' })
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionService.listSessions(user);
  }

  @Delete('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions for the current user' })
  revokeAllSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionService.revokeAllSessions(user);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one session owned by the current user' })
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.sessionService.revokeSession(user, sessionId);
  }
}
