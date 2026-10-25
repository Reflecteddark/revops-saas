/**
 * apps/web/src/types/api.ts
 *
 * Strict TypeScript typings for RevOps Enterprise OS API v1.
 * Verified against live backend endpoints and schemas.
 * NO `any` types allowed. Strict null-checks enabled.
 * All API wire fields strictly preserve snake_case matching FastAPI responses.
 */

// ============================================================================
// 1. Common & Auth
// ============================================================================

export type UserRole =
  'admin' | 'supervisor' | 'rop' | 'manager' | 'analyst' | 'ceo' | 'client';

export interface User {
  id: string;
  email: string;
  full_name: string;
  name?: string;
  role: UserRole | string;
  tenant_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClientProfile {
  login: string;
  name: string;
  role: string;
  tenant: string;
  is_active?: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  user_id: string;
  tenant_id: string;
  role: string;
  full_name: string;
}

export interface ClientLoginResponse {
  authenticated?: boolean;
  status?: string;
  session_token?: string;
  access_token?: string;
  token?: string;
  is_admin?: boolean;
  user: ClientProfile;
}

// ============================================================================
// 2. Tenants (Fleet & Multi-tenant)
// ============================================================================

export type TenantCrmType = 'bitrix24' | 'amocrm' | string;
export type TenantStatus = 'active' | 'archived' | 'frozen' | string;

export interface Tenant {
  tenant_id: string;
  tenant_name: string;
  crm_type: TenantCrmType;
  spreadsheet_id: string;
  status: TenantStatus;
  niche_name: string;
  avg_deal_check: number;
  is_template: boolean;
  pipeline_id?: string | null;
  custom_stages?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface TenantsSummary {
  total: number;
  active: number;
  amocrm: number;
  bitrix24: number;
  frozen: number;
}

// ============================================================================
// 3. Deals Management
// ============================================================================

export type DealStatus = 'active' | 'won' | 'lost' | string;

export interface Deal {
  id: string;
  deal_id: string;
  org_id: string;
  crm_deal_id: string;
  crm_source: string;
  title: string;
  amount: number;
  amount_str: string;
  stage_id: string;
  stage: string;
  status: DealStatus;
  sla_risk: boolean;
  responsible_user: string;
  segment: string;
  created_at: string;
  updated_at: string;
  synced_at: string;
  // Optional database / backend metadata
  company_name?: string | null;
  is_won?: boolean;
  is_lost?: boolean;
  is_active?: boolean;
  budget?: number | null;
  expected_close_date?: string | null;
  pipeline_id?: string | null;
}

export interface DealsResponse {
  status: string;
  tenant_id: string;
  source: string;
  deals: Deal[];
  total: number;
  sla_risk_count: number;
  total_amount: number;
}

// ============================================================================
// 4. Speech AI & Calls Scorecard (13 Criteria)
// ============================================================================

export type CallStatus = 'won' | 'risk' | 'unknown' | string;
export type CallStatusLabel =
  'ЭТАЛОН' | 'СЛИВ' | 'СЛИВ (НЕТ NEXT STEP)' | 'НЕТ ДАННЫХ' | string;

/**
 * 13 Criteria of B2B call audit:
 * cr1..cr13 with strict values: 1 (passed), 0 (failed), or null (unrated/no data).
 */
export type CriterionScore = 1 | 0 | null;

export interface Call {
  id: string;
  deal_id: string;
  deal_title: string;
  client: string;
  manager: string;
  stage: string;
  duration: string;
  amount: string;
  amount_num: number;
  score: number | null;
  status: CallStatus;
  status_label: CallStatusLabel;
  risk_amount: string;
  next_step: number | null;
  date: string;
  cr: CriterionScore[];
  error_summary: string;
  recommendation: string;
  transcript: string;
  duration_seconds?: number | null;
  created_at?: string;
  client_phone?: string;
  overall_score?: number | null;
  ai_summary?: string;
}

export interface CallsResponse {
  status: string;
  tenant_id: string;
  source: string;
  count: number;
  calls: Call[];
}

// ============================================================================
// 5. Settings & Business Configuration
// ============================================================================

export interface GeneralSettings {
  company_name: string;
  currency: string;
  period_start: string;
  period_end: string;
  monthly_target: number;
  project_start_date: string;
}

export interface StageConfig {
  id: number;
  name: string;
  sla_hours: number;
  win_pct: number;
}

export interface ManagerConfig {
  id: string;
  name: string;
  role: string;
  capacity: number;
}

export interface LossReason {
  code: string;
  reason: string;
  reactivation_prob: number;
}

export interface TelegramConfig {
  /** Server never exposes real bot token to client. Always masked or omitted. */
  bot_token?: never;
  rop_chat_id: string;
  ceo_chat_id: string;
  team_chat_id: string;
  dispatcher_schedule: string;
  dispatcher_status: boolean;
}

export interface ModuleFlag {
  code: string;
  name: string;
  category: string;
  status: boolean;
  description: string;
}

export interface Settings {
  status: string;
  source: string;
  tenant_id: string;
  general: GeneralSettings;
  stages: StageConfig[];
  managers: ManagerConfig[];
  loss_reasons: LossReason[];
  telegram: TelegramConfig;
  modules: ModuleFlag[];
}

export type SettingsResponse = Settings;

// ============================================================================
// 6. AI Insights, KPI & Radar Summary
// ============================================================================

export interface RecommendationItem {
  title: string;
  impact_rub: number;
  description: string;
}

export interface LeakCategoryBreakdown {
  count: number;
  amount_rub: number;
}

export interface KpiSummary {
  active_pipeline_rub?: number;
  active_deals_count?: number;
  sla_at_risk_count?: number;
  sla_at_risk_rub?: number;
  total_leak_rub?: number;
  p10_corridor_rub?: number;
  p50_corridor_rub?: number;
  p90_corridor_rub?: number;
  average_call_score?: number | null;
  audited_calls_count?: number;
  plan_fact_percentage?: number;
  confidence_score?: number;
  synthesis?: string;
  recommendations?: RecommendationItem[];
  revenue?: number;
  calls_total?: number;
  sla_risk_count?: number;
  win_rate?: number;
}

export interface InsightsSummaryResponse {
  status: string;
  engine: string;
  tenant_id: string;
  p10_corridor_rub?: number;
  p50_corridor_rub?: number;
  p90_corridor_rub?: number;
  confidence_score?: number;
  calculation_method?: string;
  summary?: string;
  synthesis?: string;
  executive_summary?: string;
  recommendations?: RecommendationItem[];
  insights?: RecommendationItem[];
  leak_breakdown?: Record<string, LeakCategoryBreakdown>;
  total_leak_rub?: number;
  message?: string;
  kpi?: KpiSummary | null;
}

// ============================================================================
// 7. Realtime WebSockets & Diagnostics
// ============================================================================

export type WebSocketEventType =
  | 'deal_updated'
  | 'call_ingested'
  | 'risk_detected'
  | 'sync_completed'
  | 'ping'
  | string;

export interface WebSocketMessage<T = Record<string, unknown>> {
  event: WebSocketEventType;
  tenant_id: string;
  timestamp: string;
  data: T;
}

export interface ApiError {
  detail: string;
  status_code?: number;
}
