/**
 * apps/web/src/components/methodology/ScriptModulesEditor.tsx
 *
 * Visual Editor for 13 B2B Sales Speech Modules:
 * - Recommended speech drafting
 * - Semantic Anchors builder (tags list)
 * - Banned Triggers builder (stop phrases)
 * - Min anchors required threshold
 * - Direct save via PUT /api/v1/methodology/modules/{criterion}
 */

import * as React from 'react';
import {
  AlertCircle,
  Check,
  Plus,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import type { ScriptModuleItem } from '@/types/api';

export interface ScriptModulesEditorProps {
  versionId?: string;
  tenantId?: string;
}

export function ScriptModulesEditor({ versionId, tenantId }: ScriptModulesEditorProps) {
  const [modules, setModules] = React.useState<ScriptModuleItem[]>([]);
  const [selectedCr, setSelectedCr] = React.useState<string>('cr6');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedSuccess, setSavedSuccess] = React.useState(false);

  // Form states for the currently selected module
  const [currentSpeech, setCurrentSpeech] = React.useState('');
  const [currentAnchors, setCurrentAnchors] = React.useState<string[]>([]);
  const [currentBanned, setCurrentBanned] = React.useState<string[]>([]);
  const [minAnchors, setMinAnchors] = React.useState(2);

  const [newAnchorInput, setNewAnchorInput] = React.useState('');
  const [newBannedInput, setNewBannedInput] = React.useState('');

  const loadModules = React.useCallback(() => {
    setLoading(true);
    apiClient.methodology
      .getModules(versionId, tenantId)
      .then((res) => {
        setModules(res.modules);
        const initial = res.modules.find((m) => m.target_criterion === selectedCr) || res.modules[0];
        if (initial) {
          setSelectedCr(initial.target_criterion);
          setCurrentSpeech(initial.recommended_speech);
          setCurrentAnchors(initial.semantic_anchors || []);
          setCurrentBanned(initial.banned_triggers || []);
          setMinAnchors(initial.min_anchors_required || 2);
        }
      })
      .catch((err) => {
        console.error('Failed to load script modules:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [versionId, tenantId, selectedCr]);

  React.useEffect(() => {
    loadModules();
  }, [versionId, tenantId]);

  const handleSelectModule = (cr: string) => {
    setSelectedCr(cr);
    setSavedSuccess(false);
    const mod = modules.find((m) => m.target_criterion === cr);
    if (mod) {
      setCurrentSpeech(mod.recommended_speech);
      setCurrentAnchors(mod.semantic_anchors || []);
      setCurrentBanned(mod.banned_triggers || []);
      setMinAnchors(mod.min_anchors_required || 2);
    }
  };

  const handleAddAnchor = () => {
    if (!newAnchorInput.trim()) return;
    setCurrentAnchors((prev) => [...prev, newAnchorInput.trim()]);
    setNewAnchorInput('');
  };

  const handleRemoveAnchor = (idx: number) => {
    setCurrentAnchors((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddBanned = () => {
    if (!newBannedInput.trim()) return;
    setCurrentBanned((prev) => [...prev, newBannedInput.trim()]);
    setNewBannedInput('');
  };

  const handleRemoveBanned = (idx: number) => {
    setCurrentBanned((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      await apiClient.methodology.updateModule(
        selectedCr,
        {
          recommended_speech: currentSpeech,
          semantic_anchors: currentAnchors,
          banned_triggers: currentBanned,
          min_anchors_required: minAnchors,
        },
        versionId,
        tenantId
      );
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      // Update local state
      setModules((prev) =>
        prev.map((m) =>
          m.target_criterion === selectedCr
            ? {
                ...m,
                recommended_speech: currentSpeech,
                semantic_anchors: currentAnchors,
                banned_triggers: currentBanned,
                min_anchors_required: minAnchors,
              }
            : m
        )
      );
    } catch (err) {
      console.error('Failed to save script module:', err);
    } finally {
      setSaving(false);
    }
  };

  const activeModule = modules.find((m) => m.target_criterion === selectedCr);

  return (
    <div className="space-y-6" data-testid="script-modules-editor">
      {/* Criteria Selector Pills */}
      <div className="flex flex-wrap gap-1.5 border-b border-subtle pb-3">
        {modules.map((m) => (
          <Button
            key={m.target_criterion}
            variant={selectedCr === m.target_criterion ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSelectModule(m.target_criterion)}
            className="h-8 text-xs font-mono"
            data-testid={`module-pill-${m.target_criterion}`}
          >
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
      ) : activeModule ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Speech Editor (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 bg-surface border-subtle space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary uppercase">
                      {activeModule.target_criterion.toUpperCase()}
                    </span>
                    <span className="text-xs text-tertiary">• {activeModule.stage_name}</span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground mt-0.5">
                    {activeModule.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {savedSuccess && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium animate-fadeIn">
                      <Check className="h-4 w-4" /> Сохранено
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="gap-1.5 text-xs"
                    data-testid="save-module-btn"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Сохранение...' : 'Сохранить изменения'}
                  </Button>
                </div>
              </div>

              {/* Recommended Speech Textarea */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-secondary">
                  Эталонный речевой модуль (Скрипт для менеджера)
                </label>
                <textarea
                  value={currentSpeech}
                  onChange={(e) => setCurrentSpeech(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-subtle bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                  placeholder="Введите эталонный текст реплики..."
                />
              </div>

              {/* Semantic Anchors Editor */}
              <div className="space-y-3 pt-2 border-t border-subtle">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold uppercase text-secondary">
                      Смысловые якоря (Semantic Anchors)
                    </label>
                    <p className="text-[11px] text-tertiary">
                      ИИ засчитывает Adherence = 1, если прозвучало минимум {minAnchors} тезиса
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    Требуется: {minAnchors} из {currentAnchors.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {currentAnchors.map((anchor, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-subtle bg-background px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-foreground">
                        {idx + 1}. {anchor}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAnchor(idx)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Add Anchor Input */}
                <div className="flex gap-2">
                  <Input
                    value={newAnchorInput}
                    onChange={(e) => setNewAnchorInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAnchor())}
                    placeholder="Добавить обязательный смысловой тезис..."
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddAnchor}
                    className="h-8 text-xs gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Добавить
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Banned Triggers & Settings */}
          <div className="space-y-4">
            <Card className="p-5 bg-surface border-subtle space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-rose-500">
                  Табу-фразы (Banned Triggers)
                </label>
                <p className="text-[11px] text-tertiary">
                  Если менеджер произнесет любую из этих фраз, этап считается проваленным
                </p>
              </div>

              <div className="space-y-2">
                {currentBanned.map((banned, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      «{banned}»
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveBanned(idx)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add Banned Input */}
              <div className="flex gap-2">
                <Input
                  value={newBannedInput}
                  onChange={(e) => setNewBannedInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBanned())}
                  placeholder="Стоп-фраза..."
                  className="h-8 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddBanned}
                  className="h-8 text-xs gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Threshold Selector */}
              <div className="pt-4 border-t border-subtle space-y-1.5">
                <label className="text-xs font-semibold uppercase text-secondary">
                  Порог совпадения якорей
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3].map((num) => (
                    <Button
                      key={num}
                      variant={minAnchors === num ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMinAnchors(num)}
                      className="h-8 flex-1 text-xs font-mono"
                    >
                      {num} {num === 1 ? 'якорь' : 'якоря'}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ScriptModulesEditor;
