import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Lightbulb, Send, Sparkles, Trash2, UserRound, Wand2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Card, PageHeader, Spinner } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import type { AiInsight } from '../lib/types';
import { relativeTime } from '../lib/format';
import { cn } from '../lib/utils';

type Message = { id: string; role: 'user' | 'assistant'; content: string; source?: string; at: string };

const suggestions = [
  'Where did I spend the most this month?',
  'How is my budget doing?',
  'How can I save more?',
  'Compare this month with last month',
  'What are my biggest expenses?',
];

const generators = [
  { type: 'MONTHLY_SUMMARY', title: 'Monthly summary', text: 'A clear recap of income, spending and savings.', icon: Sparkles },
  { type: 'SPENDING_ANALYSIS', title: 'Spending analysis', text: 'Where your money went, and why.', icon: Lightbulb },
  { type: 'BUDGET_ADVICE', title: 'Budget advice', text: 'Concrete improvements for your limits.', icon: Wand2 },
] as const;

export default function Assistant() {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi ${user?.name.split(' ')[0] ?? 'there'} — I can analyse your own transactions, budgets and goals. Ask me anything about your money, or generate a report.`,
      at: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [history, setHistory] = useState<AiInsight[]>([]);
  const [configured, setConfigured] = useState<{ configured: boolean; model: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api<{ insights: AiInsight[] }>('/ai/insights?limit=12');
      setHistory(data.insights);
    } catch {
      // history is optional
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    api<{ configured: boolean; model: string }>('/ai/status').then(setConfigured).catch(() => undefined);
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (question.length < 2 || sending) return;
    setInput('');
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: 'user', content: question, at: new Date().toISOString() },
    ]);
    setSending(true);
    try {
      const data = await api<{ reply: string; source: string }>('/ai/chat', { method: 'POST', body: { message: question } });
      setMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: 'assistant', content: data.reply, source: data.source, at: new Date().toISOString() },
      ]);
      void loadHistory();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The assistant could not answer right now');
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I could not reach the analysis engine. Please try again in a moment.',
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const generate = async (type: (typeof generators)[number]['type']) => {
    setGenerating(type);
    try {
      const data = await api<{ insight: AiInsight }>('/ai/insights', { method: 'POST', body: { type } });
      setMessages((current) => [
        ...current,
        {
          id: `g-${Date.now()}`,
          role: 'assistant',
          content: data.insight.content,
          source: data.insight.source,
          at: new Date().toISOString(),
        },
      ]);
      toast.success('Report generated');
      void loadHistory();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not generate the report');
    } finally {
      setGenerating(null);
    }
  };

  const removeInsight = async (id: string) => {
    try {
      await api(`/ai/insights/${id}`, { method: 'DELETE' });
      setHistory((current) => current.filter((item) => item.id !== id));
    } catch {
      toast.error('Could not delete that insight');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Private to your account"
        title="AI Assistant"
        subtitle="Ask natural-language questions about your spending. Answers use only your own financial data."
        actions={
          <Badge tone={configured?.configured ? 'success' : 'info'}>
            {configured?.configured ? `AI · ${configured.model}` : 'Rule-based engine'}
          </Badge>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {generators.map(({ type, title, text, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => void generate(type)}
                disabled={Boolean(generating)}
                className="card card-hover p-4 text-left disabled:opacity-60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                  {generating === type ? <Spinner className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <p className="mt-2.5 text-[12.5px] font-bold text-ink-900 dark:text-white">{title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">{text}</p>
              </button>
            ))}
          </div>

          <Card className="flex h-[560px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5 dark:border-white/5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-700 to-fuchsia-500 text-white">
                  <Bot className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-bold text-ink-900 dark:text-white">Money coach</p>
                  <p className="text-[10.5px] text-ink-400">Reads only your transactions, budgets and goals</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
              </span>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {messages.map((message) => (
                <div key={message.id} className={cn('flex gap-2.5', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {message.role === 'assistant' && (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div
                    className={cn(
                      'max-w-[82%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm',
                      message.role === 'user'
                        ? 'rounded-br-md bg-brand-700 text-white'
                        : 'rounded-bl-md border border-ink-100 bg-ink-50/80 text-ink-800 dark:border-white/5 dark:bg-white/[0.04] dark:text-ink-100'
                    )}
                  >
                    <p className="whitespace-pre-line">{message.content}</p>
                    {message.source && (
                      <p className="mt-2 text-[9.5px] font-semibold uppercase tracking-wider opacity-50">
                        {message.source === 'ai' ? 'AI model' : 'Rule-based analysis'} · your data
                      </p>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-200 text-ink-600 dark:bg-ink-700 dark:text-ink-200">
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl border border-ink-100 bg-white px-4 py-3 dark:border-white/5 dark:bg-white/[0.04]">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:240ms]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-ink-100 px-4 py-3 dark:border-white/5">
              <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                {suggestions.slice(0, 4).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="shrink-0 rounded-full border border-ink-200 px-3 py-1.5 text-[11px] font-semibold text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-ink-700 dark:text-ink-300 dark:hover:border-brand-600 dark:hover:bg-brand-500/10"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about your spending…"
                  maxLength={500}
                  className="input flex-1"
                  aria-label="Message the assistant"
                />
                <Button type="submit" size="icon" loading={sending} disabled={input.trim().length < 2} aria-label="Send message">
                  {!sending && <Send className="h-4 w-4" />}
                </Button>
              </form>
              <p className="mt-2 text-center text-[10px] text-ink-400">
                Answers are generated from your recorded data and are not financial advice.
              </p>
            </div>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3.5 dark:border-white/5">
            <h2 className="font-display text-[13.5px] font-bold text-ink-900 dark:text-white">Saved insights</h2>
            <p className="text-[10.5px] text-ink-400">Reports generated for your account</p>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-ink-400">
              Nothing yet. Generate a summary to keep it here.
            </p>
          ) : (
            <div className="max-h-[520px] divide-y divide-ink-50 overflow-y-auto dark:divide-white/[0.04]">
              {history.map((insight) => (
                <div key={insight.id} className="group px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">
                      {insight.type.replace('_', ' ')}
                    </p>
                    <button
                      type="button"
                      onClick={() => void removeInsight(insight.id)}
                      className="rounded p-1 text-ink-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                      aria-label="Delete insight"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {insight.prompt && <p className="mt-0.5 text-[11px] italic text-ink-400">“{insight.prompt}”</p>}
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-ink-600 dark:text-ink-300">{insight.content}</p>
                  <p className="mt-1 text-[10px] text-ink-400">{relativeTime(insight.createdAt)} · {insight.source === 'ai' ? 'AI' : 'Rules'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
