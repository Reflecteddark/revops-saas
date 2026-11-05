/**
 * apps/web/src/pages/MethodologyPage.tsx
 *
 * The speech standard of a company and what it does to its real calls:
 * - version switcher, hypothesis banner, "new hypothesis" (a copy of the version you are looking at)
 * - 2 tabs: the heatmap of the 13 audit criteria (with the comparison of two versions) and the script editor
 * - X-Ray drawer of one criterion
 * Every number is computed from real calls; with too few calls the screen says so instead of guessing.
 */

import * as React from 'react';
import { AlertTriangle, BrainCircuit, Check, ChevronDown, Flame, GitBranch, History, Layers, Plus, Sparkles } from 'lucide-react';
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
import type { HeatmapMatrixRow, MethodologyCoverage, ScriptVersionItem } from '@/types/api';

import { MethodologyHeatmap } from '@/components/methodology/MethodologyHeatmap';
import { ScriptModulesEditor } from '@/components/methodology/ScriptModulesEditor';
import { MethodologyXRayDrawer } from '@/components/methodology/MethodologyXRayDrawer';
import { SKIP_REASON, errorText } from '@/components/methodology/shared';

export function MethodologyPage() {
  const activeTenantId = useRevOpsStore((s) => s.activeTenantId);
  const tenant = activeTenantId || undefined;

  const [versions, setVersions] = React.useState<ScriptVersionItem[]>([]);
  // The chosen version belongs to the company it was chosen for: after a switch it is gone, never carried over.
  const [selection, setSelection] = React.useState<{ tenant: string | undefined; id: string }>({ tenant: undefined, id: '' });
  const selectedVersionId = selection.tenant === tenant ? selection.id : '';
  const setSelectedVersionId = React.useCallback((id: string) => setSelection({ tenant, id }), [tenant]);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const [isNewVersionOpen, setIsNewVersionOpen] = React.useState(false);
  const [newTag, setNewTag] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');
  const [newHypothesis, setNewHypothesis] = React.useState('');
  const [setNewActive, setSetNewActive] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [activeTab, setActiveTab] = React.useState<'heatmap' | 'editor'>('heatmap');

  const [matrix, setMatrix] = React.useState<HeatmapMatrixRow[]>([]);
  const [coverage, setCoverage] = React.useState<MethodologyCoverage | null>(null);
  const [loadingHeatmap, setLoadingHeatmap] = React.useState(true);

  const [backfilling, setBackfilling] = React.useState(false);
  const [backfillNote, setBackfillNote] = React.useState<string | null>(null);

  const [selectedCriterion, setSelectedCriterion] = React.useState<string | null>(null);

  // A response that arrives after the company was switched belongs to the previous company: drop it.
  const epoch = React.useRef(0);

  const loadVersions = React.useCallback(async () => {
    const mine = epoch.current;
    try {
      const res = await apiClient.methodology.getVersions(tenant);
      if (mine !== epoch.current) return;
      setVersions(res.versions);
      setSelection((prev) => (prev.tenant === tenant && res.versions.some((v) => v.id === prev.id) ? prev : { tenant, id: res.active_version_id }));
      setPageError(null);
    } catch (err) {
      if (mine === epoch.current) setPageError(errorText(err, 'Не удалось загрузить версии скрипта'));
    }
  }, [tenant]);

  const loadHeatmap = React.useCallback(
    async (versionId: string) => {
      const mine = epoch.current;
      setLoadingHeatmap(true);
      try {
        const res = await apiClient.methodology.getHeatmap(versionId, tenant);
        if (mine !== epoch.current) return;
        setMatrix(res.matrix);
        setCoverage(res.coverage ?? null);
        setPageError(null);
      } catch (err) {
        if (mine === epoch.current) setPageError(errorText(err, 'Не удалось загрузить данные методологии'));
      } finally {
        if (mine === epoch.current) setLoadingHeatmap(false);
      }
    },
    [tenant]
  );

  // another company: nothing of the previous one may stay on the screen
  React.useEffect(() => {
    epoch.current += 1;
    setVersions([]);
    setMatrix([]);
    setCoverage(null);
    setSelectedCriterion(null);
    setBackfillNote(null);
    setPageError(null);
    void loadVersions();
  }, [loadVersions]);

  React.useEffect(() => {
    if (selectedVersionId) void loadHeatmap(selectedVersionId);
  }, [selectedVersionId, loadHeatmap]);

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim() || !newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await apiClient.methodology.createVersion(
        {
          version_tag: newTag.trim(),
          title: newTitle.trim(),
          hypothesis: newHypothesis.trim() || undefined,
          set_active: setNewActive,
          base_version_id: selectedVersionId || undefined,
        },
        tenant
      );
      setIsNewVersionOpen(false);
      setNewTag('');
      setNewTitle('');
      setNewHypothesis('');
      await loadVersions();
      setSelectedVersionId(created.version_id);
    } catch (err) {
      setCreateError(errorText(err, 'Не удалось создать версию'));
    } finally {
      setCreating(false);
    }
  };

  const handleActivateVersion = async (versionId: string) => {
    try {
      await apiClient.methodology.activateVersion(versionId, tenant);
      await loadVersions();
      setSelectedVersionId(versionId);
    } catch (err) {
      setPageError(errorText(err, 'Не удалось сделать версию боевой'));
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillNote(null);
    try {
      const res = await apiClient.methodology.backfill(tenant);
      const skipped = Object.entries(res.skipped)
        .map(([reason, n]) => `${n}: ${SKIP_REASON[reason] ?? reason}`)
        .join('; ');
      setBackfillNote(`Оценено звонков: ${res.evaluated}.` + (skipped ? ` Не удалось оценить: ${skipped}.` : ''));
      if (selectedVersionId) await loadHeatmap(selectedVersionId);
    } catch (err) {
      setBackfillNote(errorText(err, 'Не удалось оценить прошлые звонки'));
    } finally {
      setBackfilling(false);
    }
  };

  const currentVersion = versions.find((v) => v.id === selectedVersionId) || versions[0];
  const hasHistory = Boolean(coverage && coverage.calls_evaluated < coverage.calls_with_transcript);

  return (
    <div className="space-y-6" data-testid="methodology-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Методология: речевой стандарт</h1>
          </div>
          <p className="text-xs text-secondary mt-1">
            Говорят ли менеджеры по вашему скрипту и проходят ли они критерий аудита, когда говорят. Цифры считаются по настоящим звонкам.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 border-subtle bg-surface text-xs font-medium" data-testid="version-selector-btn">
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                <span>
                  {currentVersion?.version_tag || 'Версия'}: {currentVersion?.title || 'Загрузка...'}
                </span>
                {currentVersion?.is_active && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                    Боевая
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3 text-tertiary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="p-2 text-xs font-semibold uppercase text-tertiary">Версии речевого стандарта</div>
              {versions.map((v) => (
                <DropdownMenuItem key={v.id} onClick={() => setSelectedVersionId(v.id)} className="flex items-center justify-between text-xs cursor-pointer py-2">
                  <div>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="font-mono text-primary">{v.version_tag}</span>
                      <span>{v.title}</span>
                    </div>
                    {v.hypothesis && <div className="text-[11px] text-tertiary line-clamp-1 mt-0.5">{v.hypothesis}</div>}
                  </div>
                  {v.is_active && <Badge className="bg-emerald-500/20 text-emerald-600 text-[10px] px-1.5 py-0">Боевая</Badge>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {currentVersion && !currentVersion.is_active && (
            <Button size="sm" variant="outline" onClick={() => handleActivateVersion(currentVersion.id)} className="h-9 gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10">
              <Check className="h-3.5 w-3.5" />
              Сделать боевой
            </Button>
          )}
          <Button size="sm" onClick={() => { setCreateError(null); setIsNewVersionOpen(true); }} className="h-9 gap-1.5 text-xs" data-testid="new-version-modal-trigger">
            <Plus className="h-3.5 w-3.5" />
            Новая гипотеза
          </Button>
        </div>
      </div>

      {pageError && (
        <div role="alert" data-testid="methodology-error" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      {currentVersion?.hypothesis && (
        <Card className="p-3.5 bg-surface border-subtle flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-foreground">Гипотеза версии {currentVersion.version_tag}: </span>
            <span className="text-secondary leading-relaxed">{currentVersion.hypothesis}</span>
          </div>
        </Card>
      )}

      {coverage && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-secondary" data-testid="methodology-coverage">
          <span>
            {coverage.calls_with_transcript === 0 ? (
              'Звонков с расшифровкой пока нет: цифры появятся, когда аудит начнёт приносить звонки.'
            ) : (
              <>
                Оценено звонков: <strong className="text-foreground">{coverage.calls_evaluated}</strong> из{' '}
                <strong className="text-foreground">{coverage.calls_with_transcript}</strong> с расшифровкой
              </>
            )}
          </span>
          {hasHistory && (
            <Button size="sm" variant="outline" onClick={handleBackfill} disabled={backfilling} className="h-7 gap-1.5 text-xs" data-testid="backfill-btn">
              <History className="h-3.5 w-3.5" />
              {backfilling ? 'Оцениваю…' : 'Оценить прошлые звонки'}
            </Button>
          )}
          {backfillNote && <span data-testid="backfill-note">{backfillNote}</span>}
        </div>
      )}

      <div className="flex border-b border-subtle">
        <button
          onClick={() => setActiveTab('heatmap')}
          data-testid="tab-heatmap"
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors duration-150',
            activeTab === 'heatmap' ? 'border-primary text-foreground' : 'border-transparent text-secondary hover:text-foreground'
          )}
        >
          <Flame className="h-4 w-4 text-amber-500" />
          Карта критериев
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          data-testid="tab-editor"
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors duration-150',
            activeTab === 'editor' ? 'border-primary text-foreground' : 'border-transparent text-secondary hover:text-foreground'
          )}
        >
          <Layers className="h-4 w-4 text-emerald-500" />
          Конструктор скрипта
        </button>
      </div>

      {activeTab === 'heatmap' && (
        <MethodologyHeatmap
          matrix={matrix}
          loading={loadingHeatmap}
          onSelectCriterion={(cr) => setSelectedCriterion(cr)}
          versions={versions}
          currentVersionId={selectedVersionId}
          tenantId={tenant}
        />
      )}

      {activeTab === 'editor' && <ScriptModulesEditor key={selectedVersionId} versionId={selectedVersionId} tenantId={tenant} />}

      <MethodologyXRayDrawer
        criterion={selectedCriterion}
        versionId={selectedVersionId}
        tenantId={tenant}
        isOpen={Boolean(selectedCriterion)}
        onClose={() => setSelectedCriterion(null)}
      />

      <Dialog open={isNewVersionOpen} onOpenChange={setIsNewVersionOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateVersion}>
            <DialogHeader>
              <DialogTitle>Создать новую гипотезу скрипта</DialogTitle>
              <DialogDescription className="text-xs">
                Все формулировки скопируются из версии {currentVersion?.version_tag ?? ''}, которую вы сейчас смотрите. Измените их в конструкторе: цифры новой версии наберутся на новых звонках.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-secondary">Тег версии (например v2.1)</label>
                <Input required value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="v2.1" className="h-9 font-mono" data-testid="input-new-version-tag" />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-secondary">Название обновления</label>
                <Input required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Новый заход и работа с возражением «Дорого»" className="h-9" data-testid="input-new-version-title" />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-secondary">Гипотеза: что должно измениться и почему</label>
                <textarea
                  rows={3}
                  value={newHypothesis}
                  onChange={(e) => setNewHypothesis(e.target.value)}
                  placeholder="Если сначала назвать окупаемость, возражение «Дорого» будет проходить чаще"
                  className="w-full rounded-lg border border-subtle bg-background p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="setActiveCheckbox" checked={setNewActive} onChange={(e) => setSetNewActive(e.target.checked)} className="h-4 w-4 rounded border-subtle text-primary" />
                <label htmlFor="setActiveCheckbox" className="font-medium text-foreground cursor-pointer">
                  Сделать боевой: новые звонки будут оцениваться по ней
                </label>
              </div>
              {createError && (
                <div role="alert" data-testid="create-version-error" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-rose-500">
                  {createError}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsNewVersionOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" size="sm" disabled={creating} data-testid="submit-new-version-btn">
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
