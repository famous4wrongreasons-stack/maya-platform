import { Injectable } from '@nestjs/common';

import {
  AuthRetentionOptions,
  AuthRetentionRepository,
} from './auth-retention.repository';

@Injectable()
export class AuthRetentionService {
  constructor(private readonly repository: AuthRetentionRepository) {}

  run(options: AuthRetentionOptions = {}) {
    return this.repository.run(options);
  }
}
