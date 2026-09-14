import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { C9Object } from './c9.contract';
import { c9AiCostConfig, c9DefaultBudget } from './c9.budget';

/**
 * The only source of a paid-reasoning allowance. It is released deployment configuration
 * carrying a verified provider price manifest and an explicit finite cap; nothing here
 * derives, estimates or defaults a price. With either half missing the run is admitted
 * with `aiCost: null`, which the database budget guard treats as a zero allowance, so
 * deterministic zero-charge work continues and paid work never starts.
 */
@Injectable()
export class C9Allowance {
  constructor(private readonly config: ConfigService) {}
  /** Verified manifest + cap, or null when this deployment funds no paid reasoning. */
  released(now: Date): { aiCost: C9Object; basis: C9Object } | null {
    return c9AiCostConfig(
      this.config.get<string>('C9_AI_PRICE_MANIFEST'),
      this.config.get<string>('C9_AI_COST_CAP_MICROS'),
      now,
    );
  }
  manifest(now: Date): C9Object {
    const allowance = this.released(now);
    return allowance
      ? { ...c9DefaultBudget(), aiCost: allowance.aiCost }
      : c9DefaultBudget();
  }
}
