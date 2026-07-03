import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'maya-saas-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
