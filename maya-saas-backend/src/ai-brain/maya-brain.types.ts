import type { AiCorePersona } from '../ai-tools/ai-core.types';

export type MayaBrainProfile =
  | 'maya_os'
  | 'maya_admin'
  | 'maya_consult'
  | 'maya_finance'
  | 'maya_analytics'
  | 'maya_marketing'
  | 'maya_hr'
  | 'maya_assistant';

export type MayaBrainIntent =
  | 'booking'
  | 'schedule_management'
  | 'business_analytics'
  | 'finance'
  | 'staff_operations'
  | 'marketing'
  | 'knowledge'
  | 'catalog'
  | 'loyalty'
  | 'support'
  | 'general';

export interface MayaBrainPlanStep {
  key: string;
  status: 'pending' | 'ready' | 'completed' | 'blocked';
}

export interface MayaBrainPlan {
  status: 'active' | 'awaiting_approval' | 'completed' | 'blocked';
  steps: MayaBrainPlanStep[];
}

export interface MayaBrainMemoryPreference {
  key: 'response_detail' | 'emoji' | 'address_form' | 'language';
  value: string;
}

export interface MayaBrainKnowledgeItem {
  citationId: string;
  sourceId: string;
  title: string;
  excerpt: string;
}

export interface MayaBrainRoute {
  persona: AiCorePersona;
  profile: MayaBrainProfile;
  intent: MayaBrainIntent;
  knowledgeRequired: boolean;
  plan: MayaBrainPlan;
}

export interface MayaBrainContext extends MayaBrainRoute {
  sessionId: string;
  promptVersion: string;
  profileInstructions: string;
  preferences: MayaBrainMemoryPreference[];
  knowledge: MayaBrainKnowledgeItem[];
}

export interface MayaBrainCitation {
  id: string;
  source_id: string;
  title: string;
}
