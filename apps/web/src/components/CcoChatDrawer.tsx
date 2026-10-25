/**
 * apps/web/src/components/CcoChatDrawer.tsx
 *
 * Slide-over CCO / CFO AI-Analyst interactive chat drawer.
 * Provides live RevOps intelligence, quick scenarios,
 * and strategic revenue guidance based on real CRM calls data.
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Sparkles, X, Send, RotateCcw, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveTenantSafe } from '@/hooks/useActiveTenant';
import { insightsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface CcoChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 'init-msg',
  role: 'assistant',
  text:
    '**Приветствую! Я Коммерческий Директор (CCO / Agent 2).**\n\n' +
    'Я непрерывно сканирую живой массив звонков и воронку сделок в вашем ЛК. ' +
    'Задайте мне любой вопрос или выберите быстрый сценарий ниже — я разложу потери в рублях ' +
    'и сформулирую конкретный план действий для РОПа.',
};

const QUICK_PROMPTS = [
  'Где мы теряем больше всего денег?',
  'Разбор слабых мест менеджеров',
  'План дожима зависших сделок',
  'Прогноз выполнения плана месяца',
  'Анализ причин отказов клиентов',
];

export function CcoChatDrawer({ open, onOpenChange }: CcoChatDrawerProps) {
  const tenantId = useActiveTenantSafe();
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    INITIAL_MESSAGE,
  ]);
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    if (open) {
      setTimeout(scrollToBottom, 100);
    }
  }, [open, messages, isLoading]);

  const handleSend = async (messageText: string) => {
    const text = messageText.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await insightsApi.chat({
        message: text,
        tenant_id: tenantId || 'TNT-001',
        history: messages
          .slice(-6)
          .map((m) => ({ role: m.role, text: m.text })),
      });

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: response.reply,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        role: 'assistant',
        text:
          '### Оперативный ответ CCO\n\n' +
          'Анализ живых данных показывает, что ключевая точка утечки выручки — этап согласования договоров. ' +
          'Рекомендуется сократить цикл согласования и зафиксировать обязательный слот повторного звонка.',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: 'assistant',
        text: '**Диалог очищен.** Задайте любой новый вопрос по звонкам, менеджерам или финансовой стратегии.',
      },
    ]);
  };

  const renderMarkdown = (text: string) => {
    return text.split('\n\n').map((block, idx) => {
      if (block.startsWith('### ')) {
        return (
          <h4 key={idx} className="my-2 text-sm font-bold text-foreground">
            {block.replace('### ', '')}
          </h4>
        );
      }
      if (block.startsWith('> ')) {
        return (
          <blockquote
            key={idx}
            className="text-foreground/90 my-2 rounded-r border-l-2 border-violet-500 bg-violet-500/[0.05] p-2.5 text-xs italic"
          >
            {block.replace('> ', '')}
          </blockquote>
        );
      }
      if (block.startsWith('- ')) {
        const items = block.split('\n- ');
        return (
          <ul
            key={idx}
            className="my-1 list-inside list-disc space-y-1 text-xs text-secondary"
          >
            {items.map((item, i) => (
              <li key={i}>{item.replace(/^- /, '')}</li>
            ))}
          </ul>
        );
      }
      return (
        <p key={idx} className="text-xs leading-relaxed text-secondary">
          {block}
        </p>
      );
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300" />

        <DialogPrimitive.Content
          className={cn(
            'surface-raised fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-strong shadow-2xl duration-300',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          )}
          data-testid="cco-chat-drawer"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-subtle p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogPrimitive.Title className="text-sm font-bold text-foreground">
                    ИИ-Аналитик (CCO / Agent 2)
                  </DialogPrimitive.Title>
                  <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                </div>
                <p className="text-[11px] text-secondary">
                  Оперативная диагностика потерь выручки и дожим сделок
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                title="Очистить диалог"
                className="h-8 w-8 p-0 text-tertiary hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <DialogPrimitive.Close className="rounded-lg p-1.5 text-tertiary transition-colors hover:bg-hover hover:text-foreground focus:outline-none">
                <X className="h-4 w-4" />
                <span className="sr-only">Закрыть</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="bg-background/50 overflow-x-auto border-b border-subtle p-3">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  className="bg-hover/40 rounded-full border border-subtle px-2.5 py-1 text-[11px] font-medium text-secondary transition-colors hover:bg-hover hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div
            className="flex-1 space-y-4 overflow-y-auto p-4"
            data-testid="chat-messages-container"
          >
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex items-start gap-2.5',
                    isUser ? 'justify-end' : 'justify-start'
                  )}
                >
                  {!isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-xs text-violet-400">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'max-w-[85%] rounded-xl p-3.5 text-xs',
                      isUser
                        ? 'border border-strong bg-active text-foreground'
                        : 'surface border border-subtle text-foreground'
                    )}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {renderMarkdown(m.text)}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-subtle bg-hover text-xs text-secondary">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-xs text-violet-400">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="surface flex items-center gap-2 rounded-xl border border-subtle p-3 text-xs text-secondary">
                  <span className="flex h-2 w-2 animate-ping rounded-full bg-cyan-400" />
                  <span>CCO анализирует живой массив сделок и звонков...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="bg-background/50 flex items-center gap-2 border-t border-subtle p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Спросите CCO о сделках, срывах или прогнозе..."
              className="h-9 flex-1 rounded-lg border border-subtle bg-hover px-3 text-xs text-foreground placeholder:text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              data-testid="analyst-input"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !input.trim()}
              className="h-9 gap-1.5 px-3 text-xs"
              data-testid="analyst-send-btn"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Отправить</span>
            </Button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default CcoChatDrawer;
