import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { StartPhoneAuthDto } from './dto/start-phone-auth.dto';
import { VerifyPhoneAuthDto } from './dto/verify-phone-auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate a user and return a JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a tenant-scoped client user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('phone/start')
  @ApiOperation({
    summary: 'Start phone-first client auth and send a verification code',
  })
  startPhoneAuth(@Body() dto: StartPhoneAuthDto, @Req() request: Request) {
    return this.authService.startPhoneAuth(dto, this.resolveClientIp(request));
  }

  @Public()
  @Post('phone/verify')
  @ApiOperation({
    summary: 'Verify a phone auth code and return a tenant-scoped JWT',
  })
  verifyPhoneAuth(@Body() dto: VerifyPhoneAuthDto) {
    return this.authService.verifyPhoneAuth(dto);
  }

  private resolveClientIp(request: Request): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0];
    const ip = forwardedIp?.trim() || request.ip?.trim();

    return ip || null;
  }
}
