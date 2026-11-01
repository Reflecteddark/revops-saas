/**
 * apps/web/src/pages/MethodologyPage.tsx
 *
 * Primary screen for AI Methodology & Script Engineering:
 * - Version switcher & New hypothesis modal
 * - 3 Core Tabs:
 *   1. 🔥 Тепловая Карта Дельты (MethodologyHeatmap)
 *   2. 🚪 Лаборатория Секретаря (GatekeeperLab)
 *   3. 📖 Конструктор Скрипта (ScriptModulesEditor)
 * - X-Ray Drawer integration
 */

import * as React from 'react';
import {
  BrainCircuit,
  Check,
  ChevronDown,
  DoorOpen,
  Flame,
  GitBranch,
  Layers,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import type { HeatmapMatrixRow, ScriptVersionItem } from '@/types/api';

import { MethodologyHeatmap } from '@/components/methodology/MethodologyHeatmap';
import { GatekeeperLab } from '@/components/methodology/GatekeeperLab';
import { ScriptModulesEditor } from '@/components/methodology/ScriptModulesEditor';
import { MethodologyXRayDrawer } from '@/components/methodology/MethodologyXRayDrawer';

export function MethodologyPage() {
  const activeTenantId = useRevOpsStore((s) => s.activeTenantId);

  // Versions state
  const [versions, setVersions] = React.useState<ScriptVersionItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string>('');
    const [isNewVersionOpen, setIsNewVersionOpen] = React.useState(false);

  // Form state for creating new version
  const [newTag, setNewTag] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');
  const [newHypothesis, setNewHypothesis] = React.useState('');
  const [setNewActive, setSetNewActive] = React.useState(true);
  const [creating, setCreating] = React.useState(false);

  // Tabs state
  const [activeTab, setActiveTab] = React.useState<'heatmap' | 'gatekeeper' | 'editor'>('heatmap');

  // Heatmap telemetry state
  const [matrix, setMatrix] = React.useState<HeatmapMatrixRow[]>([]);
  const [loadingHeatmap, setLoadingHeatmap] = React.useState(true);

  // X-Ray Drawer state
  const [selectedCriterion, setSelectedCriterion] = React.useState<string | null>(null);

  // 1. Fetch versions
  const loadVersions = React.useCallback(async () => {
    try {
      const res = await apiClient.methodology.getVersions(activeTenantId || undefined);
      setVersions(res.versions);
            if (!selectedVersionId && res.active_version_id) {
        setSelectedVersionId(res.active_version_id);
      }
    } catch (err) {
      console.error('Failed to load methodology versions:', err);
    }
  }, [activeTenantId, selectedVersionId]);

  // 2. Fetch Heatmap Matrix
  const loadHeatmap = React.useCallback(async (versionId?: string) => {
    setLoadingHeatmap(true);
    try {
      const res = await apiClient.methodology.getHeatmap(versionId, activeTenantId || undefined);
      setMatrix(res.matrix);
    } catch (err) {
      console.error('Failed to load methodology heatmap:', err);
    } finally {
      setLoadingHeatmap(false);
    }
  }, [activeTenantId]);

  React.useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  React.useEffect(() => {
    if (selectedVersionId) {
      loadHeatmap(selectedVersionId);
    }
  }, [selectedVersionId, loadHeatmap]);

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim() || !newTitle.trim()) return;

    setCreating(true);
    try {
      const created = await apiClient.methodology.createVersion(
        {
          version_tag: newTag.trim(),
          title: newTitle.trim(),
          hypothesis: newHypothesis.trim() || undefined,
          set_active: setNewActive,
        },
        (activeTenantId || undefined)
      );

      setIsNewVersionOpen(false);
      setNewTag('');
      setNewTitle('');
      setNewHypothesis('');

      // Refresh versions
      await loadVersions();
      setSelectedVersionId(created.version_id);
    } catch (err) {
      console.error('Failed to create script version:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleActivateVersion = async (versionId: string) => {
    try {
      await apiClient.methodology.activateVersion(versionId, activeTenantId || undefined);
      await loadVersions();
      setSelectedVersionId(versionId);
    } catch (err) {
      console.error('Failed to activate version:', err);
    }
  };

  const currentVersion = versions.find((v) => v.id === selectedVersionId) || versions[0];

  return (
    <div className="space-y-6" data-testid="methodology-page">
      {/* Top Header & Mission Control Strip */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              ИИ-Методология и Речевой Инжиниринг
            </h1>
          </div>
          <p className="text-xs text-secondary mt-1">
            Доказательная оптимизация скриптов продаж, смысловые якоря и чистый буст конверсии (SWR vs FWR)
          </p>
        </div>

        {/* Version Selector & New Version Button */}
        <div className="flex items-center gap-2.5">
          {/* Dropdown Menu for Versions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 border-subtle bg-surface text-xs font-medium"
                data-testid="version-selector-btn"
              >
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                <span>
                  {currentVersion?.version_tag || 'Версия'}: {currentVersion?.title || 'Загрузка...'}
                </span>
                {currentVersion?.is_active && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                    Активна
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3 text-tertiary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="p-2 text-xs font-semibold uppercase text-tertiary">
                Версии речевых стандартов
              </div>
              {versions.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onClick={() => setSelectedVersionId(v.id)}
                  className="flex items-center justify-between text-xs cursor-pointer py-2"
                >
                  <div>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="font-mono text-primary">{v.version_tag}</span>
                      <span>{v.title}</span>
                    </div>
                    {v.hypothesis && (
                      <div className="text-[11px] text-tertiary line-clamp-1 mt-0.5">
                        {v.hypothesis}
                      </div>
                    )}
                  </div>
                  {v.is_active && (
                    <Badge className="bg-emerald-500/20 text-emerald-600 text-[10px] px-1.5 py-0">
                      Активна
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New Hypothesis / Version Button */}
          {currentVersion && !currentVersion.is_active && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleActivateVersion(currentVersion.id)}
              className="h-9 gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
            >
              <Check className="h-3.5 w-3.5" />
              Сделать боевой
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setIsNewVersionOpen(true)}
            className="h-9 gap-1.5 text-xs"
            data-testid="new-version-modal-trigger"
          >
            <Plus className="h-3.5 w-3.5" />
            Новая гипотеза
          </Button>
        </div>
      </div>

      {/* Hypothesis Banner */}
      {currentVersion?.hypothesis && (
        <Card className="p-3.5 bg-surface border-subtle flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-foreground">Гипотеза версии {currentVersion.version_tag}: </span>
            <span className="text-secondary leading-relaxed">{currentVersion.hypothesis}</span>
          </div>
        </Card>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-subtle">
        <button
          onClick={() => setActiveTab('heatmap')}
          data-testid="tab-heatmap"
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors duration-150',
            activeTab === 'heatmap'
              ? 'border-primary text-foreground'
              : 'border-transparent text-secondary hover:text-foreground'
          )}
        >
          <Flame className="h-4 w-4 text-amber-500" />
          Тепловая Карта Дельты
        </button>

        <button
          onClick={() => setActiveTab('gatekeeper')}
          data-testid="tab-gatekeeper"
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors duration-150',
            activeTab === 'gatekeeper'
              ? 'border-primary text-foreground'
              : 'border-transparent text-secondary hover:text-foreground'
          )}
        >
          <DoorOpen className="h-4 w-4 text-primary" />
          Лаборатория Секретаря (cr6)
        </button>

        <button
          onClick={() => setActiveTab('editor')}
          data-testid="tab-editor"
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors duration-150',
            activeTab === 'editor'
              ? 'border-primary text-foreground'
              : 'border-transparent text-secondary hover:text-foreground'
          )}
        >
          <Layers className="h-4 w-4 text-emerald-500" />
          Конструктор Скрипта (13 модулей)
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'heatmap' && (
        <MethodologyHeatmap
          matrix={matrix}
          loading={loadingHeatmap}
          onSelectCriterion={(cr) => setSelectedCriterion(cr)}
          versions={versions}
          currentVersionId={selectedVersionId}
          tenantId={activeTenantId || undefined}
        />
      )}

      {activeTab === 'gatekeeper' && (
        <GatekeeperLab
          versionId={selectedVersionId}
          tenantId={activeTenantId || undefined}
        />
      )}

      {activeTab === 'editor' && (
        <ScriptModulesEditor
          versionId={selectedVersionId}
          tenantId={activeTenantId || undefined}
        />
      )}

      {/* Slide-over X-Ray Drawer */}
      <MethodologyXRayDrawer
        criterion={selectedCriterion}
        versionId={selectedVersionId}
        tenantId={activeTenantId || undefined}
        isOpen={Boolean(selectedCriterion)}
        onClose={() => setSelectedCriterion(null)}
      />

      {/* Modal: Create New Version */}
      <Dialog open={isNewVersionOpen} onOpenChange={setIsNewVersionOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateVersion}>
            <DialogHeader>
              <DialogTitle>Создать новую гипотезу скрипта</DialogTitle>
              <DialogDescription className="text-xs">
                Все речевые модули и смысловые якоря будут унаследованы от текущей версии. Вы сможете откалибровать их и замерить чистый буст конверсии.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-secondary">Тег версии (e.g. v2.1)</label>
                <Input
                  required
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="v2.1"
                  className="h-9 font-mono"
                  data-testid="input-new-version-tag"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-secondary">Название обновления</label>
                <Input
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Оптимизация захода на секретаря и отработки Дорого"
                  className="h-9"
                  data-testid="input-new-version-title"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-secondary">Гипотеза изменений (Что и почему должно вырасти)</label>
                <textarea
                  rows={3}
                  value={newHypothesis}
                  onChange={(e) => setNewHypothesis(e.target.value)}
                  placeholder="Экспертный запрос по кассовым разрывам поднимет выход на ЛПР с 28% до 60%..."
                  className="w-full rounded-lg border border-subtle bg-background p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="setActiveCheckbox"
                  checked={setNewActive}
                  onChange={(e) => setSetNewActive(e.target.checked)}
                  className="h-4 w-4 rounded border-subtle text-primary"
                />
                <label htmlFor="setActiveCheckbox" className="font-medium text-foreground cursor-pointer">
                  Сделать активным эталоном для отдела прямо сейчас
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewVersionOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating}
                data-testid="submit-new-version-btn"
              >
                {creating ? 'Создание...' : 'Создать версию'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MethodologyPage;
