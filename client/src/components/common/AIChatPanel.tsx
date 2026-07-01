import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Sparkles, X, Send, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
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
`;

export function AIChatPanel({ activeSection }: { activeSection: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    return () => {};
  }, []);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Scroll to latest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setShowSuggestions(false);
    setInput('');
    setLoading(true);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const loadingMsg: Message = { id: `l-${Date.now()}`, role: 'assistant', content: '', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);

    try {
      const { data } = await axios.post<{ answer: string }>('/api/ai/chat', { question: text, section });
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: data.answer, loading: false } : m));
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error ?? err.message
        : 'Something went wrong.';
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: `Error: ${msg}`, loading: false } : m));
    } finally {
      setLoading(false);
    }
  }

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
            width: 420, maxWidth: '95vw',
            background: '#0f172a',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '18px 18px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: 'linear-gradient(180deg,#1e1b4b 0%,#0f172a 100%)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
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
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {messages.length > 0 && (
                  <button
                    onClick={() => { setMessages([]); setShowSuggestions(true); }}
                    style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', padding: '3px 8px' }}
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>

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
                className="prm-ai-msg"
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}
              >
                <div style={{
                  width: 27, height: 27, borderRadius: 8, flexShrink: 0,
                  background: msg.role === 'user' ? 'linear-gradient(135deg,#4c6ef5,#7c3aed)' : 'linear-gradient(135deg,#0d9488,#0891b2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {msg.role === 'user' ? <User size={13} color="#fff" /> : <Bot size={13} color="#fff" />}
                </div>
                <div style={{
                  maxWidth: '82%',
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
              Healix AI · Live ADO + Connector data · Powered by Ollama
            </p>
          </form>
        </div>
      )}
    </>
  );
}
