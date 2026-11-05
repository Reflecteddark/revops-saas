/**
 * apps/web/src/components/methodology/ScriptModulesEditor.tsx
 *
 * The speech standard, one module per criterion:
 * - the reference phrase (what the manager is asked to say)
 * - formulations to find in the manager's speech ("|" separates interchangeable wordings)
 * - stop phrases (if the manager says one, the standard is not followed in that call)
 * - how many formulations must be found
 * A version that has been applied to calls is history: it is shown, but cannot be changed.
 */

import * as React from 'react';
import { AlertTriangle, Check, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api';
import type { ScriptModuleItem } from '@/types/api';
import { errorText } from './shared';

export interface ScriptModulesEditorProps {
  versionId?: string;
  tenantId?: string;
}

export function ScriptModulesEditor({ versionId, tenantId }: ScriptModulesEditorProps) {
  const [modules, setModules] = React.useState<ScriptModuleItem[]>([]);
  const [locked, setLocked] = React.useState(false);
  const [appliedCalls, setAppliedCalls] = React.useState(0);
  const [selectedCr, setSelectedCr] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = React.useState(false);

  const [speech, setSpeech] = React.useState('');
  const [anchors, setAnchors] = React.useState<string[]>([]);
  const [banned, setBanned] = React.useState<string[]>([]);
  const [minAnchors, setMinAnchors] = React.useState(1);
  const [newAnchor, setNewAnchor] = React.useState('');
  const [newBanned, setNewBanned] = React.useState('');
  const [dirty, setDirty] = React.useState(false);

  const fill = (m: ScriptModuleItem) => {
    setSelectedCr(m.target_criterion);
    setSpeech(m.recommended_speech);
    setAnchors(m.semantic_anchors || []);
    setBanned(m.banned_triggers || []);
    setMinAnchors(m.min_anchors_required);
    setDirty(false);
    setSaveError(null);
    setSavedSuccess(false);
  };

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    apiClient.methodology
      .getModules(versionId, tenantId)
      .then((res) => {
        if (!alive) return;
        setModules(res.modules);
        setLocked(res.locked);
        setAppliedCalls(res.applied_calls);
        if (res.modules[0]) fill(res.modules[0]);
      })
      .catch((err) => {
        if (alive) setLoadError(errorText(err, 'Не удалось загрузить скрипт'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [versionId, tenantId]);

  const selectModule = (cr: string) => {
    if (cr === selectedCr) return;
    if (dirty && !window.confirm('Несохранённые изменения этого критерия пропадут. Перейти?')) return;
    const m = modules.find((x) => x.target_criterion === cr);
    if (m) fill(m);
  };

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
    setSavedSuccess(false);
  };

  const addAnchor = () => {
    const text = newAnchor.trim();
    if (!text) return;
    setAnchors((prev) => [...prev, text]);
    setNewAnchor('');
    setDirty(true);
  };
  const addBanned = () => {
    const text = newBanned.trim();
    if (!text) return;
    setBanned((prev) => [...prev, text]);
    setNewBanned('');
    setDirty(true);
  };

  const removeAnchor = (idx: number) => {
    const next = anchors.filter((_, i) => i !== idx);
    setAnchors(next);
    setMinAnchors((m) => Math.min(m, next.length));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSavedSuccess(false);
    try {
      await apiClient.methodology.updateModule(
        selectedCr,
        { recommended_speech: speech, semantic_anchors: anchors, banned_triggers: banned, min_anchors_required: Math.min(minAnchors, anchors.length) },
        versionId,
        tenantId
      );
      setModules((prev) =>
        prev.map((m) =>
          m.target_criterion === selectedCr
            ? { ...m, recommended_speech: speech, semantic_anchors: anchors, banned_triggers: banned, min_anchors_required: Math.min(minAnchors, anchors.length) }
            : m
        )
      );
      setDirty(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setSaveError(errorText(err, 'Не удалось сохранить изменения'));
    } finally {
      setSaving(false);
    }
  };

  const active = modules.find((m) => m.target_criterion === selectedCr);
  const thresholds = Array.from({ length: Math.min(anchors.length, 5) }, (_, i) => i + 1);

  return (
    <div className="space-y-6" data-testid="script-modules-editor">
      {loadError && (
        <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {locked && (
        <Card className="p-3.5 bg-surface border-amber-500/40 text-xs flex items-start gap-2.5" data-testid="editor-locked">
          <Lock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <span className="text-secondary">
            Эта версия уже применялась к <strong className="text-foreground">{appliedCalls}</strong> звонкам, поэтому её нельзя менять: иначе цифры прошлого перестанут быть правдой. Чтобы изменить скрипт, создайте новую версию кнопкой «Новая гипотеза».
          </span>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-subtle pb-3">
        {modules.map((m) => (
          <Button key={m.target_criterion} variant={selectedCr === m.target_criterion ? 'default' : 'outline'} size="sm" onClick={() => selectModule(m.target_criterion)} className="h-8 text-xs font-mono" data-testid={`module-pill-${m.target_criterion}`}>
            {m.target_criterion.toUpperCase()}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : active ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 bg-surface border-subtle space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary uppercase">{active.target_criterion.toUpperCase()}</span>
                    <span className="text-xs text-tertiary">• {active.stage_name}</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground mt-0.5">{active.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {savedSuccess && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                      <Check className="h-4 w-4" /> Сохранено
                    </span>
                  )}
                  <Button size="sm" onClick={handleSave} disabled={saving || locked || !dirty} className="gap-1.5 text-xs" data-testid="save-module-btn">
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Сохранение...' : 'Сохранить изменения'}
                  </Button>
                </div>
              </div>

              {saveError && (
                <div role="alert" data-testid="save-module-error" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-500">
                  {saveError}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-secondary">Образцовая реплика (что просим сказать менеджера)</label>
                <textarea
                  value={speech}
                  onChange={(e) => edit(setSpeech)(e.target.value)}
                  rows={4}
                  disabled={locked}
                  className="w-full rounded-lg border border-subtle bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed disabled:opacity-60"
                  placeholder="Введите образцовую реплику..."
                />
                <p className="text-[11px] text-tertiary">Образец для людей: проверка идёт по формулировкам ниже.</p>
              </div>

              <div className="space-y-3 pt-2 border-t border-subtle">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold uppercase text-secondary">Что менеджер должен сказать</label>
                    <p className="text-[11px] text-tertiary max-w-md">
                      Короткая формулировка так, как говорят в звонке. Равнозначные варианты — через «|». Засчитывается, когда менеджер (не клиент) сказал большую часть слов формулировки в одной реплике.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono shrink-0">
                    Нужно: {Math.min(minAnchors, anchors.length)} из {anchors.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {anchors.map((anchor, idx) => (
                    <div key={`${idx}-${anchor}`} className="flex items-center justify-between rounded-lg border border-subtle bg-background px-3 py-2 text-xs">
                      <span className="font-medium text-foreground">
                        {idx + 1}. {anchor}
                      </span>
                      {!locked && (
                        <Button variant="ghost" size="sm" onClick={() => removeAnchor(idx)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" aria-label="Удалить формулировку">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {anchors.length === 0 && <p className="text-[11px] text-tertiary">Формулировок нет: критерий проверяется только по стоп-фразам.</p>}
                </div>

                {!locked && (
                  <div className="flex gap-2">
                    <Input value={newAnchor} onChange={(e) => setNewAnchor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAnchor())} placeholder="меня зовут | это говорит | на связи" className="h-8 text-xs" />
                    <Button variant="outline" size="sm" onClick={addAnchor} className="h-8 text-xs gap-1">
                      <Plus className="h-3.5 w-3.5" /> Добавить
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5 bg-surface border-subtle space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-rose-500">Стоп-фразы</label>
                <p className="text-[11px] text-tertiary">Если менеджер сказал любую из них, в этом звонке скрипт считается не соблюдённым.</p>
              </div>

              <div className="space-y-2">
                {banned.map((b, idx) => (
                  <div key={`${idx}-${b}`} className="flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs">
                    <span className="font-medium text-rose-600 dark:text-rose-400">«{b}»</span>
                    {!locked && (
                      <Button variant="ghost" size="sm" onClick={() => { setBanned((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); }} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" aria-label="Удалить стоп-фразу">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {!locked && (
                <div className="flex gap-2">
                  <Input value={newBanned} onChange={(e) => setNewBanned(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBanned())} placeholder="Стоп-фраза..." className="h-8 text-xs" />
                  <Button variant="outline" size="sm" onClick={addBanned} className="h-8 text-xs gap-1" aria-label="Добавить стоп-фразу">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              <div className="pt-4 border-t border-subtle space-y-1.5">
                <label className="text-xs font-semibold uppercase text-secondary">Сколько формулировок нужно</label>
                {thresholds.length === 0 ? (
                  <p className="text-[11px] text-tertiary">Нет формулировок — порога нет.</p>
                ) : (
                  <div className="flex gap-2">
                    {thresholds.map((n) => (
                      <Button key={n} variant={Math.min(minAnchors, anchors.length) === n ? 'default' : 'outline'} size="sm" disabled={locked} onClick={() => edit(setMinAnchors)(n)} className="h-8 flex-1 text-xs font-mono">
                        {n}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ScriptModulesEditor;
