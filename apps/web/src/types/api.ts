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
  zoom_scheduled?: boolean | number | null;
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
  revenue_target?: number | null;
  daily_calls_target?: number | null;
  monthly_meetings_target?: number | null;
  next_step_target_pct?: number | null;
  updated_at?: string;
}

export interface ManagerKpiPatchPayload {
  revenue_target?: number | null;
  daily_calls_target?: number | null;
  monthly_meetings_target?: number | null;
  capacity?: number | null;
  next_step_target_pct?: number | null;
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
  revenue_trend?: number;
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

// ============================================================================
// 8. CCO / CFO AI Analyst Interactive Chat
// ============================================================================

export interface AnalystChatPayload {
  message: string;
  tenant_id: string;
  history?: { role: string; text?: string; content?: string }[];
  context?: {
    total_calls?: number;
    avg_score?: number;
    next_step_pct?: number;
    fake_yes_count?: number;
    leak_rub?: number;
  };
}

export interface AnalystChatResponse {
  reply: string;
  status?: string;
}

// ============================================================================
// 9. Admin Fleet & Mission Control Center
// ============================================================================

export interface AdminServiceStatus {
  healthy?: boolean;
  running?: boolean;
  valid?: boolean;
  port?: number;
  pid?: number;
  memory_mb?: number;
  status_label: string;
  details?: string;
  url?: string;
  docs_url?: string;
}

export interface AdminTaskStatus {
  name?: string;
  status_label: string;
  last_run_time?: string;
  next_run_time?: string;
  exit_code?: number;
  healthy?: boolean;
}

export interface AdminGeminiStatus {
  model: string;
  proxy_worker?: string;
  criteria_count?: number;
  status_label: string;
  latency_ms?: number;
}

export interface AdminSystemStatus {
  timestamp: string;
  fleet_status:
    'ALL_SYSTEMS_NOMINAL' | 'DEGRADED_LOCAL' | 'ACTION_REQUIRED' | string;
  fleet_label: string;
  fastapi: AdminServiceStatus;
  n8n: AdminServiceStatus;
  cloudflare_tunnel: AdminServiceStatus;
  google_sheets: AdminServiceStatus;
  tasks: {
    fastapi_backend?: AdminTaskStatus;
    daily_sync?: AdminTaskStatus;
    devops_healer?: AdminTaskStatus;
    n8n_runner?: AdminTaskStatus;
    [key: string]: AdminTaskStatus | undefined;
  };
  gemini_ai: AdminGeminiStatus;
}

export interface AdminLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'success' | string;
  msg: string;
  service?: string;
}

export interface AdminLogsResponse {
  type: string;
  logs: AdminLogEntry[];
  filter?: string;
}

export interface FleetActionRequest {
  action:
    | 'start_all'
    | 'stop_all'
    | 'restart_n8n'
    | 'restart_tunnel'
    | 'start_n8n'
    | 'start_tunnel'
    | string;
  service?: string;
}

export interface FleetActionResponse {
  success: boolean;
  action: string;
  output?: string[];
  message?: string;
}

// ============================================================================
// 10. Multi-Tenant Onboarding & Client Lifecycle
// ============================================================================

export interface ConnectedClient {
  login: string;
  name: string;
  role: string;
  is_active: boolean;
  is_system?: boolean;
}

export interface TenantLifecycleRecord {
  tenant_id: string;
  tenant_name: string;
  effective_status: 'active' | 'frozen' | 'archived' | string;
  crm_type: 'amocrm' | 'bitrix24' | 'hybrid' | string;
  spreadsheet_id?: string;
  spreadsheet_url?: string;
  inbound_webhook_url?: string;
  inbound_webhook_b24_url?: string;
  niche_name?: string;
  avg_deal_check?: number;
  target_next_step?: string;
  amo_domain?: string;
  b24_webhook_url?: string;
  crm_webhook_url?: string;
  amo_token?: string;
  client_email?: string;
  telephony_webhook_url?: string;
  amo_webhook_url?: string;
  bitrix_webhook_url?: string;
  connected_clients?: ConnectedClient[];
  minutes_used?: number;
  minutes_quota?: number;
  monthly_target?: number;
  spent_rub?: number;
  created_at?: string;
}

export interface TenantUpdatePayload {
  tenant_name?: string;
  client_email?: string;
  crm_type?: 'amocrm' | 'bitrix24' | string;
  amo_domain?: string;
  amo_token?: string;
  crm_webhook_url?: string;
  niche_name?: string;
  avg_deal_check?: number;
  monthly_target?: number;
  target_next_step?: string;
  new_password?: string;
  spreadsheet_id?: string;
  minutes_quota?: number;
}

export interface AdminTenantsListResponse {
  tenants: TenantLifecycleRecord[];
  archived: TenantLifecycleRecord[];
  master_template?: Record<string, unknown>;
  total_active: number;
  total_frozen: number;
  total_archived: number;
}

export interface TenantProvisionPayload {
  name: string;
  email?: string;
  password?: string;
  role?: string;
  crm_type: 'amocrm' | 'bitrix24' | string;
  amo_domain?: string;
  amo_token?: string;
  crm_webhook?: string;
  niche_name?: string;
  avg_deal_check?: number;
  target_next_step?: string;
  sheet_id?: string;
}

export interface TenantProvisionResponse {
  success: boolean;
  tenant_id: string;
  tenant: Record<string, unknown>;
  credentials: {
    login: string;
    password?: string;
    role: string;
  };
  brief: string;
  spreadsheet_url?: string;
  webhook_url?: string;
}

export interface TenantHealthCheck {
  key: string;
  title: string;
  status: 'ok' | 'warning' | 'error' | string;
  details: string;
  elapsed_ms?: number;
}

export interface TenantHealthDiagnostic {
  tenant_id: string;
  tenant_name: string;
  overall_status: 'healthy' | 'degraded' | 'critical' | string;
  checks: TenantHealthCheck[];
  timestamp: string;
}

// ============================================================================
// 11. CRM Status, Webhooks & Call Simulation
// ============================================================================

export interface CrmProviderStatus {
  available: boolean;
  connected: boolean;
  label: string;
  domain?: string;
  webhook_url?: string;
  rest_status?: string;
  status_text?: string;
}

export interface CrmStatusResponse {
  tenant_id: string;
  tenant_name: string;
  active_crm: 'amocrm' | 'bitrix24' | string;
  spreadsheet_id?: string;
  bitrix24: CrmProviderStatus;
  amocrm: CrmProviderStatus;
}

export interface CrmActionPayload {
  action: 'switch_crm' | 'show_stages' | 'dry_run' | 'sync_deals' | string;
  tenant_id?: string;
  crm_type?: 'amocrm' | 'bitrix24' | string;
}

export interface SimulateCallPayload {
  tenant_id: string;
  provider: 'amocrm' | 'bitrix24' | string;
  manager_name: string;
  client_phone: string;
  duration_sec: number;
  simulate_leak: boolean;
}

export interface QuarantineCallItem {
  id: string;
  deal_id?: string;
  tenant_id?: string;
  manager?: string;
  client?: string;
  reason?: string;
  quarantine_reason?: string;
  timestamp?: string;
  status?: string;
  audio_url?: string;
}

export interface QuarantineCallsResponse {
  status: string;
  total: number;
  in_quarantine_count: number;
  calls: QuarantineCallItem[];
}

// ============================================================================
// 11. Integrations Health, Reconciliation & DLQ Management
// ============================================================================

export interface ServiceHealthItem {
  status:
    'healthy' | 'degraded' | 'error' | 'clean' | 'action_required' | string;
  label: string;
  queue_length?: number;
  calls_count?: number;
  deals_count?: number;
  synced_count?: number;
  pending_count?: number;
  active_failures?: number;
  total_failures?: number;
}

export interface ReconciliationMetrics {
  dwh_total_calls: number;
  sheets_synced_calls: number;
  pending_queue_calls: number;
  dwh_total_deals: number;
  dlq_failures: number;
  is_balanced: boolean;
  balance_percentage: number;
}

export interface DlqItem {
  id: string;
  crm_source: string;
  external_call_id: string;
  audio_url?: string;
  error_message?: string;
  retry_count: number;
  created_at: string;
  is_resolved: boolean;
}

export interface IntegrationsHealthResponse {
  status: 'healthy' | 'warning' | 'error' | string;
  timestamp: string;
  tenant_id: string;
  services: {
    redis_queue: ServiceHealthItem;
    postgres_dwh: ServiceHealthItem;
    google_sheets_syncer: ServiceHealthItem;
    dead_letter_queue: ServiceHealthItem;
    [key: string]: ServiceHealthItem | undefined;
  };
  reconciliation: ReconciliationMetrics;
  dlq_items: DlqItem[];
}

export interface DlqRetryResponse {
  status: 'success' | 'ok' | 'error' | string;
  re_enqueued_count: number;
  message: string;
}

export interface TelegramReportResponse {
  status: 'sent' | 'sent_via_proxy' | string;
  chat_id: string;
  timestamp?: string;
}
