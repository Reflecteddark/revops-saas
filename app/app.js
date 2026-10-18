/**
 * RevOps Enterprise OS - Main Application Orchestrator (v20.4)
 * Modularized Architecture (Variant A):
 *   - js/core.js     : Shell, auth sessions, tenant routing, themes, toast, command palette, live ticker
 *   - js/calls.js    : Calls dataset, 13 criteria audit, table rendering, audio simulation, playbook diffs
 *   - js/charts.js   : Monte-Carlo simulator, rep performance, 13 criteria radar, skills heatmap, bento charts
 *   - js/deals.js    : Deals pipeline, financial bridge, One-Pager modal, WebSocket & live sync
 *   - js/admin.js    : Fleet control, sheets sync, task scheduler, Gemini diagnostic, CRM connector, onboarding
 *   - js/settings.js : 28 business configuration parameters SSOT, revenue presets, module toggles
 *   - js/analyst.js  : AI Analyst & CCO Agent 2 interactive copilot chat
 */

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  if (localStorage.getItem('revops_sidebar_expanded') === '1') {
    const sb = document.getElementById('mpSidebar');
    if (sb) sb.classList.add('expanded');
  }
  initCallsTable();
  renderSkillsHeatmap();
  const savedDensity = localStorage.getItem('revops_table_density') || 'excel-pro';
  setTableDensity(savedDensity);

  // Dynamic Hero KPI calculation on startup (pure zero-state from CALLS_DATA)
  refreshAllDashboardViews();

  // Trigger card motion entrance on active tab
  const initialView = document.querySelector('.tab-view.active');
  if (initialView) animateCardsIn(initialView);

  initMonteCarloChart();
  initRepPerformanceChart();
  initSpeechRadarChart();

  // Develop Bento Tier-1 Charts
  initDevelopDissectionChart();
  initDevelopDonutChart();
  initDevelopSplineChart();

  // V20.2 Tier-1 Additions
  initWaveformScrubbing();

  const savedTheme = localStorage.getItem('revops_accent_theme') || 'purple';
  if (typeof setAccentTheme === 'function') {
    setAccentTheme(savedTheme);
  }

  let savedMode = localStorage.getItem('revops_theme_mode');
  if (!savedMode || savedMode === 'light') {
    savedMode = 'dark';
    try { localStorage.setItem('revops_theme_mode', 'dark'); } catch (e) {}
  }
  if (typeof setThemeMode === 'function') {
    setThemeMode(savedMode);
  }

  const cmdInput = document.getElementById('cmdPaletteInput');
  if (cmdInput) {
    cmdInput.addEventListener('keydown', handleCmdPaletteKeydown);
  }

  // initCustomCursor();
  initTenantsSelector();
  initWebSocketListener();
  fetchLiveCallsData(false);
  fetchAndPopulateSettings(false);
  tickLiveStatus();
  updateChartTimestamps();

  // Initial tab router (?tab=admin or /admin)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = window.__INITIAL_TAB__ || urlParams.get('tab');
    if (targetTab && ALL_TABS.includes(targetTab)) {
      switchTab(targetTab);
    }
  } catch (e) {}
});



// ==========================================================================
// EXPOSE INTERACTIVE HANDLERS GLOBALLY ON WINDOW FOR INLINE ONCLICK EVENTS
// ==========================================================================
window.initAnalystTab = typeof initAnalystTab !== 'undefined' ? initAnalystTab : null;
window.sendAnalystChat = typeof sendAnalystChat !== 'undefined' ? sendAnalystChat : null;
window.triggerAnalystQuickPrompt = typeof triggerAnalystQuickPrompt !== 'undefined' ? triggerAnalystQuickPrompt : null;
window.clearAnalystChat = typeof clearAnalystChat !== 'undefined' ? clearAnalystChat : null;
window.copyRescueScript = typeof copyRescueScript !== 'undefined' ? copyRescueScript : null;
window.copyRescueScriptByCallId = typeof copyRescueScriptByCallId !== 'undefined' ? copyRescueScriptByCallId : null;
window.setAccentTheme = typeof setAccentTheme !== 'undefined' ? setAccentTheme : null;
window.copyPlaybookScript = typeof copyPlaybookScript !== 'undefined' ? copyPlaybookScript : null;
window.setPillManagerFilter = typeof setPillManagerFilter !== 'undefined' ? setPillManagerFilter : null;
window.setPillStatusFilter = typeof setPillStatusFilter !== 'undefined' ? setPillStatusFilter : null;
window.setPillRadarRep = typeof setPillRadarRep !== 'undefined' ? setPillRadarRep : null;
window.triggerSelfHealingAudit = typeof triggerSelfHealingAudit !== 'undefined' ? triggerSelfHealingAudit : null;
window.recalcExpress = typeof recalcExpress !== 'undefined' ? recalcExpress : null;
window.drillDownSkill = typeof drillDownSkill !== 'undefined' ? drillDownSkill : null;
window.switchTab = typeof switchTab !== 'undefined' ? switchTab : null;
window.filterCallsTable = typeof filterCallsTable !== 'undefined' ? filterCallsTable : null;
window.logout = typeof logout !== 'undefined' ? logout : null;
window.toggleSidebar = typeof toggleSidebar !== 'undefined' ? toggleSidebar : null;
window.openCommandPalette = typeof openCommandPalette !== 'undefined' ? openCommandPalette : null;
window.closeCommandPalette = typeof closeCommandPalette !== 'undefined' ? closeCommandPalette : null;
window.openOnePagerModal = typeof openOnePagerModal !== 'undefined' ? openOnePagerModal : null;
window.closeOnePagerModal = typeof closeOnePagerModal !== 'undefined' ? closeOnePagerModal : null;
window.triggerSyncSimulation = typeof triggerSyncSimulation !== 'undefined' ? triggerSyncSimulation : null;
window.renderSkillsHeatmap = typeof renderSkillsHeatmap !== 'undefined' ? renderSkillsHeatmap : null;
window.filterRepAudit = typeof filterRepAudit !== 'undefined' ? filterRepAudit : null;
window.toggleSinDetails = typeof toggleSinDetails !== 'undefined' ? toggleSinDetails : null;

// Admin Fleet Control Handlers
window.loadAdminStatus = typeof loadAdminStatus !== 'undefined' ? loadAdminStatus : null;
window.runFleetAction = typeof runFleetAction !== 'undefined' ? runFleetAction : null;
window.runSheetsAction = typeof runSheetsAction !== 'undefined' ? runSheetsAction : null;
window.runSheetsTarget = typeof runSheetsTarget !== 'undefined' ? runSheetsTarget : null;
window.runTaskAction = typeof runTaskAction !== 'undefined' ? runTaskAction : null;
window.saveDailyTaskTime = typeof saveDailyTaskTime !== 'undefined' ? saveDailyTaskTime : null;
window.testGeminiApi = typeof testGeminiApi !== 'undefined' ? testGeminiApi : null;
window.fetchAdminLogs = typeof fetchAdminLogs !== 'undefined' ? fetchAdminLogs : null;
window.clearAdminConsole = typeof clearAdminConsole !== 'undefined' ? clearAdminConsole : null;
window.copyAdminTunnelUrl = typeof copyAdminTunnelUrl !== 'undefined' ? copyAdminTunnelUrl : null;
window.appendAdminTerminalLog = typeof appendAdminTerminalLog !== 'undefined' ? appendAdminTerminalLog : null;
window.generateRandomPassword = typeof generateRandomPassword !== 'undefined' ? generateRandomPassword : null;
window.registerNewClientAccess = typeof registerNewClientAccess !== 'undefined' ? registerNewClientAccess : null;
window.copyClientInviteMessage = typeof copyClientInviteMessage !== 'undefined' ? copyClientInviteMessage : null;
window.deleteClientAccess = typeof deleteClientAccess !== 'undefined' ? deleteClientAccess : null;
window.renderAdminClientsTable = typeof renderAdminClientsTable !== 'undefined' ? renderAdminClientsTable : null;
window.runCCOAction = typeof runCCOAction !== 'undefined' ? runCCOAction : null;
window.runHealerAction = typeof runHealerAction !== 'undefined' ? runHealerAction : null;
window.loadFeaturesConfig = typeof loadFeaturesConfig !== 'undefined' ? loadFeaturesConfig : null;
window.toggleFeatureFlag = typeof toggleFeatureFlag !== 'undefined' ? toggleFeatureFlag : null;
window.archiveDesktopLaunchers = typeof archiveDesktopLaunchers !== 'undefined' ? archiveDesktopLaunchers : null;
window.restoreDesktopLaunchers = typeof restoreDesktopLaunchers !== 'undefined' ? restoreDesktopLaunchers : null;
window.loadAdminCrmStatus = typeof loadAdminCrmStatus !== 'undefined' ? loadAdminCrmStatus : null;
window.switchAdminCrm = typeof switchAdminCrm !== 'undefined' ? switchAdminCrm : null;
window.runAdminCrmAction = typeof runAdminCrmAction !== 'undefined' ? runAdminCrmAction : null;





window.getMonthlyTarget = typeof getMonthlyTarget !== 'undefined' ? getMonthlyTarget : null;
window.fetchAndPopulateSettings = typeof fetchAndPopulateSettings !== 'undefined' ? fetchAndPopulateSettings : null;
window.submitSystemSettingsForm = typeof submitSystemSettingsForm !== 'undefined' ? submitSystemSettingsForm : null;
window.setTargetPreset = typeof setTargetPreset !== 'undefined' ? setTargetPreset : null;
window.setPeriodPreset = typeof setPeriodPreset !== 'undefined' ? setPeriodPreset : null;
window.toggleAllModules = typeof toggleAllModules !== 'undefined' ? toggleAllModules : null;

