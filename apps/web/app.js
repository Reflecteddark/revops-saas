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

  const savedMode = localStorage.getItem('revops_theme_mode') || 'dark';
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
  if (typeof loadCrmProviderStatus === 'function') {
    loadCrmProviderStatus();
  }
  fetchLiveCallsData(false);
  if (typeof fetchLiveDealsData === 'function') {
    fetchLiveDealsData(false);
  }
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

  // Render Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  } else {
    window.addEventListener('load', () => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }
});

