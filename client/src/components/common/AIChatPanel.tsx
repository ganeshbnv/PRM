import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import apiClient from '../../api/client';
import { Sparkles, X, Send, Bot, User, Copy, Check, Download, Trash2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  ts: number;
}

type Section = 'boards' | 'bugs' | 'engineers' | 'repos' | 'wiki' | 'risks' | 'general';

const SECTION_LABELS: Record<Section, string> = {
  boards: 'Sprint Boards', bugs: 'Bug Tracker', engineers: 'Engineers',
  repos: 'Repositories', wiki: 'Wiki', risks: 'Risk Register', general: 'Dashboard',
};

const SECTION_SUGGESTIONS: Record<Section, string[]> = {
  boards:    ["What's the current sprint status?", 'Which items are behind schedule?', 'Who has the most active work?'],
  bugs:      ['How many critical bugs are open?', "What's the bug trend this sprint?", 'Which bugs need immediate attention?'],
  engineers: ['Who is the most active contributor?', "What's recent commit activity?", 'Any team capacity concerns?'],
  repos:     ['Which repos are most active?', 'Any open pull requests?', 'Recent branch activity?'],
  wiki:      ['What documentation is available?', 'Any stale wiki pages?', 'What topics need documentation?'],
  risks:     ['What are the top project risks?', 'Any critical blockers?', "What's the risk mitigation status?"],
  general:   ["Give me a project health summary", 'What needs attention today?', "What's the team's velocity?"],
};

const AI_CSS_ID = 'prm-ai-chat-css';
const AI_CSS = `
@keyframes prm-ai-slide {
  from { transform: translateX(420px); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
}
@keyframes prm-ai-msg-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes prm-ai-dot {
  0%,80%,100% { transform: scale(0.55); opacity: 0.35; }
  40%         { transform: scale(1);    opacity: 1; }
}
@keyframes prm-ai-ring {
  0%,100% { box-shadow: 0 0 0 0   rgba(99,102,241,0.45); }
  50%     { box-shadow: 0 0 0 10px rgba(99,102,241,0);    }
}
.prm-ai-panel { animation: prm-ai-slide 0.28s cubic-bezier(0.16,1,0.3,1) both; }
.prm-ai-msg   { animation: prm-ai-msg-in 0.22s ease both; }
.prm-ai-d1    { display:inline-block; width:6px; height:6px; border-radius:50%; background:#818cf8; animation: prm-ai-dot 1.2s ease-in-out infinite 0s;   }
.prm-ai-d2    { display:inline-block; width:6px; height:6px; border-radius:50%; background:#818cf8; animation: prm-ai-dot 1.2s ease-in-out infinite 0.2s; }
.prm-ai-d3    { display:inline-block; width:6px; height:6px; border-radius:50%; background:#818cf8; animation: prm-ai-dot 1.2s ease-in-out infinite 0.4s; }
.prm-ai-ring  { animation: prm-ai-ring 2.5s ease-in-out infinite; }
.prm-ai-bubble:hover .prm-ai-copy { opacity: 1 !important; }
`;

const HIST_KEY = (section: Section) => `prm-ai-chat-history-${section}`;
const MAX_STORED = 100;

function loadHistory(section: Section): Message[] {
  try {
    const raw = localStorage.getItem(HIST_KEY(section));
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch { return []; }
}

function saveHistory(section: Section, msgs: Message[]) {
  try {
    const toSave = msgs.filter(m => !m.loading).slice(-MAX_STORED);
    localStorage.setItem(HIST_KEY(section), JSON.stringify(toSave));
  } catch {}
}

function downloadConversation(msgs: Message[], sectionLabel: string) {
  const real = msgs.filter(m => !m.loading);
  if (!real.length) return;
  let out = `Healix AI Chat — ${sectionLabel}\nExported ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
  for (const m of real) {
    const time = new Date(m.ts).toLocaleTimeString();
    out += `[${m.role === 'user' ? 'You' : 'Healix AI'}]  ${time}\n${m.content}\n\n${'─'.repeat(50)}\n\n`;
  }
  const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healix-ai-${sectionLabel.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={copy}
      className="prm-ai-copy"
      title={copied ? 'Copied!' : 'Copy message'}
      style={{
        opacity: 0,
        transition: 'opacity 0.15s',
        background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3, color: copied ? '#34d399' : 'rgba(255,255,255,0.4)',
        fontSize: 10, flexShrink: 0,
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AIChatPanel({ activeSection }: { activeSection: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevSectionRef = useRef<Section | null>(null);

  const section = (activeSection as Section) in SECTION_LABELS ? (activeSection as Section) : 'general';
  const sectionLabel = SECTION_LABELS[section];
  const suggestions = SECTION_SUGGESTIONS[section];

  // Inject CSS once
  useEffect(() => {
    if (!document.getElementById(AI_CSS_ID)) {
      const el = document.createElement('style');
      el.id = AI_CSS_ID;
      el.textContent = AI_CSS;
      document.head.appendChild(el);
    }
  }, []);

  // Load history when section changes
  useEffect(() => {
    if (prevSectionRef.current && prevSectionRef.current !== section) {
      // Save messages for the previous section before switching
      setMessages(prev => { saveHistory(prevSectionRef.current!, prev); return prev; });
    }
    prevSectionRef.current = section;
    const hist = loadHistory(section);
    setMessages(hist);
    setShowSuggestions(hist.length === 0);
  }, [section]);

  // Save history when messages change (non-loading messages only)
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => saveHistory(section, messages), 500);
    return () => { if (saveRef.current) clearTimeout(saveRef.current); };
  }, [messages, section]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Scroll to latest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setShowSuggestions(true);
    localStorage.removeItem(HIST_KEY(section));
  }, [section]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setShowSuggestions(false);
    setInput('');
    setLoading(true);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text, ts: Date.now() };
    const loadingMsg: Message = { id: `l-${Date.now()}`, role: 'assistant', content: '', loading: true, ts: Date.now() };
    setMessages(prev => [...prev, userMsg, loadingMsg]);

    try {
      const { data } = await apiClient.post<{ answer: string }>('/ai/chat', { question: text, section });
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: data.answer, loading: false, ts: Date.now() } : m));
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error ?? err.message
        : 'Something went wrong.';
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: `Error: ${msg}`, loading: false, ts: Date.now() } : m));
    } finally {
      setLoading(false);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={open ? '' : 'prm-ai-ring'}
        title="Healix AI Assistant"
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          width: 54, height: 54, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg,#4c6ef5,#7c3aed)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(76,110,245,0.5)',
          transition: 'transform 0.25s, box-shadow 0.2s',
          transform: open ? 'rotate(180deg) scale(0.95)' : 'scale(1)',
        }}
      >
        {open ? <X size={21} /> : <Sparkles size={21} />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="prm-ai-panel"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 999,
            width: 440, maxWidth: '95vw',
            background: '#0f172a',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: 'linear-gradient(180deg,#1e1b4b 0%,#0f172a 100%)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg,#4c6ef5,#7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={17} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14.5, letterSpacing: -0.2 }}>Healix AI</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 1 }}>
                  Context: <span style={{ color: '#818cf8' }}>{sectionLabel}</span>
                  {hasMessages && (
                    <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 8 }}>
                      · {messages.filter(m => !m.loading).length} messages
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {hasMessages && (
                  <button
                    onClick={() => downloadConversation(messages, sectionLabel)}
                    title="Download conversation"
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 7, cursor: 'pointer', padding: '5px 8px',
                      display: 'flex', alignItems: 'center', gap: 4,
                      color: 'rgba(255,255,255,0.45)', fontSize: 11,
                    }}
                  >
                    <Download size={12} />
                    <span>Export</span>
                  </button>
                )}
                {hasMessages && (
                  <button
                    onClick={clearHistory}
                    title="Clear history"
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 7, cursor: 'pointer', padding: '5px 8px',
                      display: 'flex', alignItems: 'center', gap: 4,
                      color: 'rgba(255,255,255,0.35)', fontSize: 11,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: 'none',
                    color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
                    padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Welcome */}
            {messages.length === 0 && (
              <div style={{ padding: '24px 12px 8px', textAlign: 'center' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 15, margin: '0 auto 12px',
                  background: 'rgba(76,110,245,0.15)',
                  border: '1px solid rgba(76,110,245,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={22} color="#818cf8" />
                </div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
                  Ask me anything about <strong style={{ color: '#a5b4fc' }}>{sectionLabel}</strong>. I'll pull live data from all connected systems and give you a comprehensive answer.
                </p>
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 8 }}>
                  Your conversation history is saved per module.
                </p>
              </div>
            )}

            {/* Suggestion chips */}
            {showSuggestions && messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      textAlign: 'left', padding: '9px 13px',
                      background: 'rgba(76,110,245,0.09)',
                      border: '1px solid rgba(76,110,245,0.2)',
                      borderRadius: 9, color: '#a5b4fc',
                      fontSize: 13, cursor: 'pointer', lineHeight: 1.4,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Message list */}
            {messages.map(msg => (
              <div
                key={msg.id}
                className="prm-ai-msg prm-ai-bubble"
                style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                <div style={{
                  width: 27, height: 27, borderRadius: 8, flexShrink: 0,
                  background: msg.role === 'user' ? 'linear-gradient(135deg,#4c6ef5,#7c3aed)' : 'linear-gradient(135deg,#0d9488,#0891b2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {msg.role === 'user' ? <User size={13} color="#fff" /> : <Bot size={13} color="#fff" />}
                </div>
                <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '13px 3px 13px 13px' : '3px 13px 13px 13px',
                    background: msg.role === 'user' ? 'linear-gradient(135deg,#4c6ef5,#5b21b6)' : 'rgba(255,255,255,0.06)',
                    border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.07)',
                    fontSize: 13.5, lineHeight: 1.65, color: '#e2e8f0',
                  }}>
                    {msg.loading ? (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
                        <span className="prm-ai-d1" /><span className="prm-ai-d2" /><span className="prm-ai-d3" />
                      </span>
                    ) : (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    )}
                  </div>
                  {!msg.loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{formatTime(msg.ts)}</span>
                      <CopyButton text={msg.content} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={e => { e.preventDefault(); send(input); }}
            style={{ padding: '10px 14px 18px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: '#0a1628' }}
          >
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 13, padding: '7px 7px 7px 13px',
            }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Ask about ${sectionLabel}…`}
                disabled={loading}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 13.5 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                style={{
                  width: 32, height: 32, borderRadius: 9, border: 'none', flexShrink: 0,
                  background: input.trim() && !loading ? 'linear-gradient(135deg,#4c6ef5,#7c3aed)' : 'rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                }}
              >
                <Send size={14} color={input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.25)'} />
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', margin: '7px 0 0', textAlign: 'center' }}>
              Healix AI · Live ADO + Connector data · History saved per module
            </p>
          </form>
        </div>
      )}
    </>
  );
}
