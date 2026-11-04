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
  tenant_id?: string;
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
// 3. Deals Management & Multi-Pipelines
// ============================================================================

export type DealStatus = 'active' | 'won' | 'lost' | string;

export interface PipelineStage {
  id: string;
  name: string;
  color?: string;
  sort?: number;
  is_won?: boolean;
  is_lost?: boolean;
  semantic?: string;
  deal_count?: number;
  total_amount?: number;
}

export interface Pipeline {
  id: string;
  name: string;
  is_main?: boolean;
  stages: PipelineStage[];
  deal_count?: number;
  total_amount?: number;
  won_amount?: number;
  lost_amount?: number;
  active_amount?: number;
  sla_risk_count?: number;
}

export interface PipelinesResponse {
  status: string;
  tenant_id: string;
  pipelines: Pipeline[];
  total_pipelines: number;
}

export interface RepPerformanceMetric {
  manager_name: string;
  won_amount: number;
  won_count: number;
  lost_count: number;
  active_count: number;
  total_deals: number;
  avg_deal_amount: number;
  win_rate_pct: number;
  gross_conversion_pct: number;
  cycle_days_median: number | null;
  sla_risk_amount: number;
  calls_count: number;
  speech_score_avg: number | null;
  next_step_pct: number;
  sample_size_ok: boolean;
  success_driver: string;
  weak_spot: string;
}

export interface RepBenchmarkLeader {
  name: string;
  won_amount: number;
  won_count: number;
  avg_deal_amount: number;
  win_rate_pct: number;
  cycle_days_median: number | null;
  speech_score_avg: number | null;
  aov_delta_pct: number;
  win_rate_delta: number;
  drivers: string[];
  summary: string;
}

export interface TeamBenchmarks {
  total_won_amount: number;
  avg_deal_amount: number;
  win_rate_pct: number;
  cycle_days_median: number | null;
  speech_score_avg: number | null;
}

export interface RepsPerformanceResponse {
  status: string;
  tenant_id: string;
  pipeline_id: string | null;
  total_reps: number;
  reps: RepPerformanceMetric[];
  team_benchmarks: TeamBenchmarks;
  benchmark_leader: RepBenchmarkLeader | null;
}

export interface DealLinkedCall {
  id: string;
  external_call_id?: string | null;
  client_phone: string;
  duration_seconds: number;
  duration_str: string;
  status: string;
  overall_score: number;
  scorecard_criteria?: Record<string, number | null>;
  transcript_text?: string;
  ai_summary?: string;
  next_action_extracted?: string;
  has_audio?: boolean;
  created_at?: string;
}

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
  stage_name?: string;
  stage_order?: number;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
  status: DealStatus;
  loss_reason?: string;
  loss_reason_code?: string;
  sla_risk: boolean;
  days_in_stage?: number;
  risk_reason?: string; // why the SLA risk is set (empty when not at risk)
  next_step_date?: string | null; // ISO, UTC
  responsible_user: string;
  manager_name?: string;
  contact_phone?: string;
  segment: string;
  calls_count?: number;
  avg_call_score?: number;
  calls?: DealLinkedCall[];
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
  custom_payload?: Record<string, unknown>;
}

export interface SingleDealResponse {
  status: string;
  deal: Deal;
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

/**
 * Quality of a call by its score (won 9-13, norm 6-8, risk 0-5), or why it has no score:
 * unanswered = nobody talked (voicemail, a drop), audit_failed = the AI could not read the recording.
 */
export type CallStatus = 'won' | 'norm' | 'risk' | 'unknown' | 'unanswered' | 'audit_failed' | string;
export type CallKind = 'assessed' | 'unanswered' | 'audit_failed' | 'unrated';
export type CallStatusLabel =
  'ЭТАЛОН' | 'НОРМА' | 'СРЫВ' | 'НЕДОЗВОН' | 'СБОЙ АНАЛИЗА' | 'НЕТ ДАННЫХ' | string;

/**
 * 13 Criteria of B2B call audit:
 * cr1..cr13 with strict values: 1 (passed), 0 (failed), or null (unrated/no data).
 */
export type CriterionScore = 1 | 0 | null;

/** The AI's reason and the quote behind one criterion; a quote the server could not find in the transcript is not sent. */
export interface CriterionEvidence {
  why: string;
  quote: string;
}

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
  kind?: CallKind;
  status: CallStatus;
  status_label: CallStatusLabel;
  risk_amount: string;
  next_step: number | null;
  date: string;
  /** The recording is played through GET /calls/{id}/audio; the link itself never reaches the browser. */
  has_audio?: boolean;
  cr: CriterionScore[];
  /** Audit contract v2. `cr` holds null where a criterion did not apply; passed/applicable say how the score was counted. */
  passed?: number | null;
  applicable?: number | null;
  evidence?: Record<string, CriterionEvidence>;
  summary?: string;
  call_type?: string;
  ended_by?: string;
  reached_decision_maker?: boolean;
  audit_model?: string;
  audit_version?: number;
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
  avg_deal_check?: number | null; // company's average deal check, RUB (null = not set)
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
  daily_dials_target?: number | null;
  monthly_meetings_target?: number | null;
  meetings_enabled?: boolean;
  next_step_target_pct?: number | null;
  updated_at?: string;
}

export interface ManagerKpiPatchPayload {
  revenue_target?: number | null;
  daily_calls_target?: number | null;
  daily_dials_target?: number | null;
  monthly_meetings_target?: number | null;
  meetings_enabled?: boolean;
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
  bot_token?: string;
  chat_id?: string;
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

export interface AutonomyConfig {
  allow_crm_mutations: boolean;
  enable_telegram_notifications: boolean;
  allow_client_communication: boolean;
}

export interface Settings {
  status: string;
  source: string;
  tenant_id: string;
  crm_type?: string;
  general: GeneralSettings;
  stages: StageConfig[];
  managers: ManagerConfig[];
  loss_reasons: LossReason[];
  telegram: TelegramConfig;
  modules: ModuleFlag[];
  autonomy?: AutonomyConfig;
}

export interface CrmSyncManagersResponse {
  status: string;
  message: string;
  crm_type: string;
  added_count: number;
  total_count: number;
  managers: ManagerConfig[];
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
  amount_rub?: number; // legacy key
  sum?: number | null; // money (null = not estimated)
  avg?: number | null;
  avg_check?: number | null;
  assumed_default?: boolean;
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
  confidence_score?: number | null;
  synthesis?: string;
  recommendations?: RecommendationItem[];
  /** Revenue of deals won in the current month (backend insights.kpi). */
  revenue?: number;
  won_count?: number;
  /** YYYY-MM the revenue refers to. */
  period?: string;
  /** 'crm_last_stage_change' or 'updated_at_fallback' (won date approximated). */
  revenue_basis?: string;
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
  confidence_score?: number | null;
  calculation_method?: string;
  summary?: string;
  synthesis?: string;
  executive_summary?: string;
  recommendations?: RecommendationItem[];
  insights?: RecommendationItem[];
  // categories (fake_yes, stuck_deals) plus the scalars total_leak_rub / capped_by_pipeline
  leak_breakdown?: Record<string, LeakCategoryBreakdown | number | boolean>;
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


// ==========================================
// Methodology & Script Engineering Types
// ==========================================

export interface ScriptVersionItem {
  id: string;
  version_tag: string;
  title: string;
  hypothesis?: string | null;
  is_active: boolean;
  activated_at?: string | null;
  created_at: string;
}

export interface ScriptVersionsResponse {
  tenant_id: string;
  active_version_id: string;
  versions: ScriptVersionItem[];
}

export interface ScriptModuleItem {
  id: string;
  target_criterion: string;
  title: string;
  stage_name: string;
  recommended_speech: string;
  semantic_anchors: string[];
  banned_triggers: string[];
  min_anchors_required: number;
}

export interface ScriptModulesResponse {
  version_id: string;
  modules: ScriptModuleItem[];
}

export type MethodologyVerdict =
  | 'WORKING_STANDARD'
  | 'SABOTAGE_HIDDEN_GEM'
  | 'HYPOTHESIS_FAILED'
  | 'FREESTYLE_STRONGER'
  | 'COLLECTING_DATA';

export interface HeatmapMatrixRow {
  criterion: string;
  title: string;
  stage: string;
  total_relevant_calls: number;
  script_calls: number;
  freestyle_calls: number;
  ar_pct: number;
  swr_pct: number;
  fwr_pct: number;
  total_win_pct: number;
  script_lift_pct: number;
  verdict_status: MethodologyVerdict;
  is_sabotage: boolean;
  delta_pct: number;
}

export interface HeatmapResponse {
  tenant_id: string;
  version_id: string;
  matrix: HeatmapMatrixRow[];
}

export interface XRayManager {
  name: string;
  total_calls: number;
  script_calls: number;
  ar_pct: number;
  win_pct: number;
  is_saboteur: boolean;
  is_champion: boolean;
}

export interface XRayGoldenQuote {
  call_id: string;
  manager_name: string;
  quote: string;
  timestamp_sec: number;
  matched_anchors: string[];
}

export interface XRayResponse {
  criterion: string;
  title: string;
  stage: string;
  verdict: MethodologyVerdict;
  verdict_label: string;
  module: {
    recommended_speech: string;
    semantic_anchors: string[];
    banned_triggers: string[];
  };
  stats: {
    total_calls: number;
    script_calls: number;
    freestyle_calls: number;
    script_wins: number;
    freestyle_wins: number;
    ar_pct: number;
    swr_pct: number;
    fwr_pct: number;
    script_lift_pct: number;
  };
  managers: XRayManager[];
  golden_quotes: XRayGoldenQuote[];
}

export interface GatekeeperHook {
  hook_category: string;
  phrase: string;
  gatekeeper_prompt?: string;
  manager_speech?: string;
  psychological_trigger?: string;
  success_rate_pct: number;
  uses_count: number;
  timestamp_sec: number;
  pattern_type: string;
}

export interface VersionComparisonMetrics {
  total_calls: number;
  script_calls: number;
  ar_pct: number;
  swr_pct: number;
  fwr_pct: number;
  lift_pct: number;
  defect_rate_pct: number;
}

export type InterventionVerdict =
  | 'IMPROVEMENT_CONFIRMED'
  | 'SABOTAGE_NEW_VERSION'
  | 'HYPOTHESIS_FAILED'
  | 'STABLE_NEUTRAL'
  | 'COLLECTING_DATA';

export interface VersionComparisonRow {
  criterion: string;
  title: string;
  stage: string;
  v1_metrics: VersionComparisonMetrics;
  v2_metrics: VersionComparisonMetrics;
  delta_lift_pct: number;
  delta_defect_rate_pct: number;
  intervention_verdict: InterventionVerdict;
  verdict_label: string;
}

export interface VersionComparisonResponse {
  tenant_id: string;
  v1: {
    id: string;
    version_tag: string;
    title: string;
    created_at?: string | null;
  };
  v2: {
    id: string;
    version_tag: string;
    title: string;
    created_at?: string | null;
  };
  comparison: VersionComparisonRow[];
  summary: {
    overall_status: string;
    summary_verdict: string;
    improved_criteria_count: number;
    degraded_criteria_count: number;
    neutral_criteria_count: number;
    avg_lift_delta_pct: number;
    avg_defect_reduction_pct: number;
  };
}

export interface GatekeeperKillerPhrase {
  phrase: string;
  drop_rate_pct: number;
  reason: string;
}

export interface GatekeeperLabResponse {
  tenant_id: string;
  version_id: string;
  total_attempts: number;
  bypassed_count: number;
  pass_rate_pct: number;
  winning_hooks: GatekeeperHook[];
  banned_killer_phrases: GatekeeperKillerPhrase[];
}
