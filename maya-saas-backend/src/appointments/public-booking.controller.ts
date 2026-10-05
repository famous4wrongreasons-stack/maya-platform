import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { PublicBookingService } from './public-booking.service';

@Public()
@Controller('public-booking')
export class PublicBookingController {
  constructor(private readonly booking: PublicBookingService) {}
  @Post('sessions')
  @Header('Cache-Control', 'no-store')
  session(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.booking.open(body, req, res);
  }
  @Get('services')
  @Header('Cache-Control', 'no-store')
  services(@Query() query: unknown, @Req() req: Request) {
    return this.booking.services(query, req);
  }
  @Post('availability')
  @Header('Cache-Control', 'no-store')
  availability(@Body() body: unknown, @Req() req: Request) {
    return this.booking.availability(body, req);
  }
  @Post('quotes')
  @Header('Cache-Control', 'no-store')
  quote(@Body() body: unknown, @Req() req: Request) {
    return this.booking.quote(body, req);
  }
  @Post('attempts')
  @Header('Cache-Control', 'no-store')
  attempt(@Body() body: unknown, @Req() req: Request) {
    return this.booking.create(body, req);
  }
  @Get('attempts/:attemptRef')
  @Header('Cache-Control', 'no-store')
  status(@Param('attemptRef') ref: string, @Req() req: Request) {
    return this.booking.status(ref, req);
  }
}
