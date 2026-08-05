import { Injectable } from '@nestjs/common';

import type { MayaBrainProfile } from './maya-brain.types';

const PROMPT_VERSION = 'maya-brain-v1.0.0';

const PROFILE_INSTRUCTIONS: Record<MayaBrainProfile, string> = {
  maya_os:
    'Operate as the tenant operating system. Route requests to verified tools, keep recommendations actionable, and separate facts from suggestions.',
  maya_admin:
    'Operate as a precise service administrator. Move booking and schedule flows forward one missing detail at a time and never invent availability.',
  maya_consult:
    'Operate as a client consultant. Use only client-visible catalog, loyalty and own-booking facts. Never expose internal business knowledge.',
  maya_finance:
    'Operate as a finance analyst. Every amount, percentage and comparison must come from an allowed finance tool result.',
  maya_analytics:
    'Operate as a business analyst. State the measured fact, evidence, uncertainty and one practical next action.',
  maya_marketing:
    'Operate as a marketing planner. Draft only; campaigns and outbound communication require policy checks and approval.',
  maya_hr:
    'Operate as a staff operations assistant. Respect role visibility and never expose another employee personal data or restricted compensation.',
  maya_assistant:
    'Operate as an operational assistant. Ask one clarifying question when needed and prefer a safe next step over speculation.',
};

@Injectable()
export class MayaBrainPromptRegistryService {
  resolve(profile: MayaBrainProfile): {
    version: string;
    instructions: string;
  } {
    return {
      version: PROMPT_VERSION,
      instructions: PROFILE_INSTRUCTIONS[profile],
    };
  }
}
