import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Highlight } from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Typography } from '@tiptap/extension-typography';
import {
  Plus, ChevronRight, ChevronDown, Bold, Italic, Underline as UnderlineIcon,
  Link as LinkIcon, ArrowLeft, Trash2, MessageSquare,
  CheckCircle, Reply, X, Search, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Minus, History, RotateCcw,
  Strikethrough, Highlighter, Table as TableIcon, CheckSquare,
  Type, Hash, Paperclip, FileDown, Maximize2, Minimize2, FileUp,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  wikiAuth, wikiSpaces, wikiPages, wikiComments, wikiAttachments,
  getWikiAuth, setWikiAuth, clearWikiAuth,
  type WUser, type WSpace, type WPageNode, type WPage, type WComment,
  type WVersion, type WVersionDetail, type WAttachment,
} from './wikiApi';

// ─── helpers ─────────────────────────────────────────────────────────────────

function cn(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(' ');
}

function Ago({ date }: { date: string }) {
  return <span title={format(new Date(date), 'MMM d, yyyy HH:mm')}>{formatDistanceToNow(new Date(date), { addSuffix: true })}</span>;
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const color = colors[Math.abs(h) % colors.length];
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={cn(color, 'rounded-full flex items-center justify-center text-white font-medium flex-shrink-0',
      size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm')}>
      {initials}
    </div>
  );
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function findNode(nodes: WPageNode[], id: string): WPageNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}

function removeNode(nodes: WPageNode[], id: string): [WPageNode[], WPageNode | null] {
  let removed: WPageNode | null = null;
  const result = nodes
    .filter(n => { if (n.id === id) { removed = n; return false; } return true; })
    .map(n => { const [ch, r] = removeNode(n.children, id); if (r) removed = r; return { ...n, children: ch }; });
  return [result, removed];
}

function insertNode(nodes: WPageNode[], node: WPageNode, parentId: string | null, position: number): WPageNode[] {
  const updated = { ...node, parentId, position };
  if (parentId === null) return [...nodes, updated].sort((a, b) => a.position - b.position);
  return nodes.map(n => {
    if (n.id === parentId) return { ...n, children: [...n.children, updated].sort((a, b) => a.position - b.position) };
    return { ...n, children: insertNode(n.children, node, parentId, position) };
  });
}

// ─── DnD types ───────────────────────────────────────────────────────────────

interface DragIndicator { overId: string | null; position: 'before' | 'into' | 'after' }
interface DragProps {
  dragIdRef: React.MutableRefObject<string | null>;
  indicator: DragIndicator;
  setIndicator: React.Dispatch<React.SetStateAction<DragIndicator>>;
  onMove: (dragId: string, targetId: string, pos: 'before' | 'into' | 'after') => Promise<void>;
}

// ─── Slash commands ───────────────────────────────────────────────────────────

interface SlashCmd {
  id: string; label: string; description: string;
  icon: React.ReactNode;
  action: (editor: Editor) => void;
}

const SLASH_COMMANDS: SlashCmd[] = [
  { id: 'h1', label: 'Heading 1', description: 'Large section heading', icon: <Hash size={15} />, action: e => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', description: 'Medium section heading', icon: <Hash size={13} />, action: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', description: 'Small section heading', icon: <Hash size={11} />, action: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'text', label: 'Text', description: 'Plain paragraph', icon: <Type size={14} />, action: e => e.chain().focus().setParagraph().run() },
  { id: 'ul', label: 'Bullet List', description: 'Unordered list', icon: <List size={14} />, action: e => e.chain().focus().toggleBulletList().run() },
  { id: 'ol', label: 'Numbered List', description: 'Ordered list', icon: <ListOrdered size={14} />, action: e => e.chain().focus().toggleOrderedList().run() },
  { id: 'todo', label: 'To-do', description: 'Checklist', icon: <CheckSquare size={14} />, action: e => e.chain().focus().toggleTaskList().run() },
  { id: 'quote', label: 'Quote', description: 'Blockquote', icon: <Quote size={14} />, action: e => e.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'Code Block', description: 'Code with syntax', icon: <Code size={14} />, action: e => e.chain().focus().toggleCodeBlock().run() },
  { id: 'table', label: 'Table', description: '3×3 table', icon: <TableIcon size={14} />, action: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'divider', label: 'Divider', description: 'Horizontal line', icon: <Minus size={14} />, action: e => e.chain().focus().setHorizontalRule().run() },
];

// ─── Rich Editor ─────────────────────────────────────────────────────────────

function RichEditor({
  content, onUpdate, saveStatus, editorRef, fullWidth,
}: {
  content: string;
  onUpdate: (html: string) => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  editorRef: React.MutableRefObject<Editor | null>;
  fullWidth?: boolean;
}) {
  // Floating selection toolbar
  const [selToolbar, setSelToolbar] = useState<{ x: number; y: number } | null>(null);
  // Slash command menu
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-brand-400 underline cursor-pointer' } }),
      Image,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      Typography,
      Placeholder.configure({ placeholder: 'Start writing, or type / for commands…' }),
    ],
    content,
    editable: true,
    onUpdate: ({ editor: e }) => onUpdate(e.getHTML()),
  });

  // Expose editor via ref
  useEffect(() => { editorRef.current = editor; }, [editor, editorRef]);

  // Floating selection toolbar
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const { empty, from, to } = editor.state.selection;
      if (empty || from === to) { setSelToolbar(null); return; }
      try {
        const startCoords = editor.view.coordsAtPos(from);
        const endCoords = editor.view.coordsAtPos(to);
        setSelToolbar({
          x: (startCoords.left + endCoords.right) / 2,
          y: Math.min(startCoords.top, endCoords.top),
        });
      } catch { setSelToolbar(null); }
    };
    const clearSel = () => setSelToolbar(null);
    editor.on('selectionUpdate', handler);
    editor.on('blur', clearSel);
    return () => { editor.off('selectionUpdate', handler); editor.off('blur', clearSel); };
  }, [editor]);

  // Slash command detection
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const { state } = editor;
      const { from, empty } = state.selection;
      if (!empty) { setSlashMenu(null); return; }
      try {
        const $pos = state.doc.resolve(from);
        const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
        const match = textBefore.match(/\/(\w*)$/);
        if (match) {
          const coords = editor.view.coordsAtPos(from);
          setSlashMenu({ x: coords.left, y: coords.bottom, query: match[1].toLowerCase() });
          setSlashIdx(0);
        } else {
          setSlashMenu(null);
        }
      } catch { setSlashMenu(null); }
    };
    editor.on('update', handler);
    editor.on('selectionUpdate', handler);
    return () => { editor.off('update', handler); editor.off('selectionUpdate', handler); };
  }, [editor]);

  // Keyboard handling for slash menu
  useEffect(() => {
    if (!editor || !slashMenu) return;
    const filtered = SLASH_COMMANDS.filter(c =>
      !slashMenu.query || c.label.toLowerCase().includes(slashMenu.query) || c.id.includes(slashMenu.query)
    );
    const handler = (e: KeyboardEvent) => {
      if (!slashMenu) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filtered.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + filtered.length) % filtered.length); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[slashIdx];
        if (cmd) executeSlash(cmd);
      } else if (e.key === 'Escape') { e.preventDefault(); setSlashMenu(null); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [editor, slashMenu, slashIdx]);

  const executeSlash = (cmd: SlashCmd) => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const $pos = editor.state.doc.resolve(from);
    const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
    const match = textBefore.match(/\/(\w*)$/);
    const deleteLen = match ? match[0].length : 1;
    editor.chain().focus().deleteRange({ from: from - deleteLen, to: from }).run();
    cmd.action(editor);
    setSlashMenu(null);
  };

  const filteredCmds = slashMenu
    ? SLASH_COMMANDS.filter(c => !slashMenu.query || c.label.toLowerCase().includes(slashMenu.query) || c.id.includes(slashMenu.query))
    : [];

  const FMT_BTN = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn('w-7 h-7 flex items-center justify-center rounded transition-colors',
        active ? 'bg-white/20 text-white' : 'text-gray-200 hover:bg-white/10 hover:text-white')}>
      {children}
    </button>
  );

  return (
    <div ref={containerRef} className="relative flex-1 overflow-y-auto">
      {/* Sticky save indicator */}
      <div className="sticky top-0 z-10 flex justify-end px-4 py-1 pointer-events-none">
        <span className={cn('text-xs transition-opacity duration-300',
          saveStatus === 'saving' ? 'text-gray-400 opacity-100'
            : saveStatus === 'saved' ? 'text-emerald-400 opacity-100'
              : saveStatus === 'error' ? 'text-red-400 opacity-100'
                : 'opacity-0')}>
          {saveStatus === 'saving' ? '● Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save failed'}
        </span>
      </div>

      {/* Editor area */}
      <div className={cn(fullWidth ? 'max-w-none px-8' : 'max-w-3xl px-8', 'mx-auto pb-24')}>
        <EditorContent editor={editor} className="wiki-prose" />
      </div>

      {/* Floating selection toolbar */}
      {selToolbar && editor && (
        <div
          className="fixed z-50 flex items-center gap-0.5 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl px-1.5 py-1 -translate-x-1/2 -translate-y-full pointer-events-auto"
          style={{ left: selToolbar.x, top: selToolbar.y - 8 }}
          onMouseDown={e => e.preventDefault()}
        >
          <FMT_BTN active={editor.isActive('bold')} onClick={() => { editor.chain().focus().toggleBold().run(); }} title="Bold"><Bold size={13} /></FMT_BTN>
          <FMT_BTN active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic size={13} /></FMT_BTN>
          <FMT_BTN active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={13} /></FMT_BTN>
          <FMT_BTN active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough size={13} /></FMT_BTN>
          <FMT_BTN active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight"><Highlighter size={13} /></FMT_BTN>
          <div className="w-px h-4 bg-gray-600 mx-0.5" />
          <FMT_BTN active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="H1"><span className="text-xs font-bold">H1</span></FMT_BTN>
          <FMT_BTN active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="H2"><span className="text-xs font-bold">H2</span></FMT_BTN>
          <FMT_BTN active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="H3"><span className="text-xs font-bold">H3</span></FMT_BTN>
          <div className="w-px h-4 bg-gray-600 mx-0.5" />
          <FMT_BTN active={editor.isActive('link')} onClick={() => {
            if (editor.isActive('link')) { editor.chain().focus().unsetLink().run(); return; }
            const url = prompt('URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }} title="Link"><LinkIcon size={13} /></FMT_BTN>
          <FMT_BTN active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code"><Code size={13} /></FMT_BTN>
        </div>
      )}

      {/* Slash command menu */}
      {slashMenu && filteredCmds.length > 0 && (
        <div
          className="fixed z-50 w-64 bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden"
          style={{ left: slashMenu.x, top: slashMenu.y + 4 }}
        >
          <div className="px-3 py-2 border-b border-surface-border">
            <p className="text-xs text-gray-500">Commands {slashMenu.query && <span className="text-brand-400">· "{slashMenu.query}"</span>}</p>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filteredCmds.map((cmd, i) => (
              <li key={cmd.id}>
                <button
                  onMouseDown={e => { e.preventDefault(); executeSlash(cmd); }}
                  className={cn('w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    i === slashIdx ? 'bg-brand-600/20 text-brand-300' : 'text-gray-300 hover:bg-surface-elevated hover:text-white')}
                >
                  <span className={cn('w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 text-gray-400',
                    i === slashIdx ? 'bg-brand-600/30 text-brand-300' : 'bg-surface-elevated')}>
                    {cmd.icon}
                  </span>
                  <div>
                    <div className="text-xs font-medium">{cmd.label}</div>
                    <div className="text-xs text-gray-500">{cmd.description}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Spaces list ─────────────────────────────────────────────────────────────

function SpaceList({ spaces, loading, onSelect, onCreate }: {
  spaces: WSpace[]; loading: boolean;
  onSelect: (s: WSpace) => void; onCreate: (s: WSpace) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [emoji, setEmoji] = useState('📄');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (name) setKey(name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
  }, [name]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true);
    try {
      const s = await wikiSpaces.create({ name, key, description: desc, iconEmoji: emoji });
      onCreate(s); setShowCreate(false); setName(''); setKey(''); setDesc('');
    } finally { setCreating(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Spaces</h2>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={12} />New Space
        </button>
      </div>
      {showCreate && (
        <form onSubmit={create} className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2}
              className="w-10 h-10 text-xl text-center bg-surface-elevated border border-surface-border rounded-lg" />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Space name" required
              className="flex-1 bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500" />
          </div>
          <input value={key} onChange={e => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder="Key (e.g. ENG)" required
            className="w-full bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)"
            className="w-full bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors">Cancel</button>
            <button type="submit" disabled={creating} className="bg-brand-600 hover:bg-brand-700 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1">
              {creating && <Spinner />}Create
            </button>
          </div>
        </form>
      )}
      {spaces.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm"><div className="text-4xl mb-3">📄</div>No spaces yet. Create your first space above.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map(s => (
            <button key={s.id} onClick={() => onSelect(s)}
              className="text-left p-4 bg-surface-card hover:bg-surface-elevated border border-surface-border hover:border-brand-600/50 rounded-xl transition-all group">
              <div className="text-2xl mb-2">{s.iconEmoji}</div>
              <div className="font-medium text-white group-hover:text-brand-400 transition-colors">{s.name}</div>
              {s.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</div>}
              {s._count && <div className="text-xs text-gray-600 mt-2">{s._count.pages} pages</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page tree item ───────────────────────────────────────────────────────────

function PageTreeItem({ node, depth, activeId, onSelect, onAdd, drag }: {
  node: WPageNode; depth: number; activeId?: string;
  onSelect: (id: string) => void; onAdd: (parentId: string) => void; drag: DragProps;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [hovered, setHovered] = useState(false);
  const ind = drag.indicator;

  const calcPos = (e: React.DragEvent): 'before' | 'into' | 'after' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = (e.clientY - rect.top) / rect.height;
    return rel < 0.28 ? 'before' : rel > 0.72 ? 'after' : 'into';
  };

  return (
    <li className="relative">
      {ind.overId === node.id && ind.position === 'before' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-brand-500 rounded z-10 pointer-events-none" />
      )}
      <div
        draggable
        onDragStart={e => { e.dataTransfer.setData('pageId', node.id); e.dataTransfer.effectAllowed = 'move'; drag.dragIdRef.current = node.id; }}
        onDragEnd={() => { drag.dragIdRef.current = null; drag.setIndicator({ overId: null, position: 'before' }); }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (drag.dragIdRef.current === node.id) return; drag.setIndicator({ overId: node.id, position: calcPos(e) }); e.dataTransfer.dropEffect = 'move'; }}
        onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) drag.setIndicator(p => p.overId === node.id ? { overId: null, position: 'before' } : p); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); const id = e.dataTransfer.getData('pageId'); if (id && id !== node.id) void drag.onMove(id, node.id, calcPos(e)); drag.setIndicator({ overId: null, position: 'before' }); }}
        className={cn(
          'flex items-center gap-1 py-1 pr-2 rounded-md cursor-pointer group transition-colors text-sm select-none',
          activeId === node.id ? 'bg-brand-600/20 text-brand-300' : 'text-gray-300 hover:bg-surface-elevated hover:text-white',
          drag.dragIdRef.current === node.id && 'opacity-40',
          ind.overId === node.id && ind.position === 'into' && 'ring-1 ring-brand-500 bg-brand-600/10',
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={() => onSelect(node.id)}
      >
        <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className={cn('w-4 h-4 flex items-center justify-center flex-shrink-0', !node.children.length && 'invisible')}>
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <span className="flex-shrink-0">{node.emoji}</span>
        <span className="truncate flex-1">{node.title || 'Untitled'}</span>
        {hovered && (
          <button onClick={e => { e.stopPropagation(); onAdd(node.id); }}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-surface-border text-gray-500 hover:text-white">
            <Plus size={10} />
          </button>
        )}
      </div>
      {ind.overId === node.id && ind.position === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-500 rounded z-10 pointer-events-none" />
      )}
      {expanded && node.children.length > 0 && (
        <ul>
          {node.children.map(child => (
            <PageTreeItem key={child.id} node={child} depth={depth + 1} activeId={activeId} onSelect={onSelect} onAdd={onAdd} drag={drag} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Version history panel ────────────────────────────────────────────────────

function VersionHistoryPanel({ pageId, currentContent, currentTitle, onRestore, onClose }: {
  pageId: string; currentContent: string; currentTitle: string;
  onRestore: (content: string, title: string) => void; onClose: () => void;
}) {
  const [versions, setVersions] = useState<WVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WVersionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => { wikiPages.versions(pageId).then(setVersions).finally(() => setLoading(false)); }, [pageId]);

  const loadVersion = async (v: WVersion) => {
    setLoadingDetail(true);
    try { setSelected(await wikiPages.version(pageId, v.version)); }
    finally { setLoadingDetail(false); }
  };

  return (
    <div className="w-80 border-l border-surface-border flex flex-col bg-surface-card flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2"><History size={14} className="text-gray-400" /><h3 className="text-sm font-semibold text-white">Version History</h3></div>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={14} /></button>
      </div>
      <div className="flex flex-col overflow-hidden flex-1">
        <div className="flex-shrink-0 overflow-y-auto border-b border-surface-border" style={{ maxHeight: '45%' }}>
          {loading ? <div className="flex justify-center py-6"><Spinner /></div>
            : versions.length === 0 ? <p className="text-xs text-gray-500 text-center py-6">No saved versions yet</p>
              : <ul className="py-1">
                  {versions.map((v, i) => (
                    <li key={v.id}>
                      <button onClick={() => loadVersion(v)}
                        className={cn('w-full text-left px-4 py-2.5 transition-colors border-l-2',
                          selected?.version === v.version ? 'bg-brand-600/15 border-brand-500' : 'hover:bg-surface-elevated border-transparent')}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-white">v{v.version}{i === 0 && <span className="ml-1.5 text-emerald-400 font-normal">(latest)</span>}</span>
                          <Avatar name={v.author.name} size="sm" />
                        </div>
                        <div className="text-xs text-gray-500"><Ago date={v.createdAt} /></div>
                        {v.title && <div className="text-xs text-gray-400 truncate mt-0.5">{v.title}</div>}
                      </button>
                    </li>
                  ))}
                </ul>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingDetail ? <div className="flex justify-center py-6"><Spinner /></div>
            : selected ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between flex-shrink-0">
                  <div><p className="text-xs font-medium text-white">{selected.title}</p><p className="text-xs text-gray-500">v{selected.version} · <Ago date={selected.createdAt} /></p></div>
                  {!(selected.content === currentContent && selected.title === currentTitle) && (
                    <button onClick={() => onRestore(selected.content, selected.title)}
                      className="flex items-center gap-1 text-xs bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0">
                      <RotateCcw size={10} />Restore
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 text-xs text-gray-300 wiki-prose" dangerouslySetInnerHTML={{ __html: selected.content }} />
              </div>
            ) : <div className="flex items-center justify-center h-full py-10"><p className="text-xs text-gray-500">Select a version to preview</p></div>}
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function TB({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onMouseDown={e => { e.preventDefault(); onClick(); }} title={title}
      className={cn('w-7 h-7 flex items-center justify-center rounded text-xs transition-colors',
        active ? 'bg-surface-border text-white' : 'text-gray-400 hover:bg-surface-elevated hover:text-white')}>
      {children}
    </button>
  );
}

// ─── Page Editor ─────────────────────────────────────────────────────────────

function PageEditorView({ page, onBack, onSaved, onDeleted, currentUser, fullWidth, onToggleFullWidth }: {
  page: WPage; onBack: () => void;
  onSaved: (p: WPage) => void; onDeleted: () => void;
  currentUser: WUser;
  fullWidth: boolean;
  onToggleFullWidth: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showComments, setShowComments] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [comments, setComments] = useState<WComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(page.content || '');
  const titleRef = useRef(page.title);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    if (showComments) wikiComments.list(page.id).then(setComments).catch(() => {});
  }, [showComments, page.id]);

  const doSave = useCallback(async (t: string, html: string) => {
    setSaveStatus('saving');
    try {
      const updated = await wikiPages.update(page.id, { title: t, content: html });
      onSaved(updated);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch { setSaveStatus('error'); }
  }, [page.id, onSaved]);

  const schedSave = (html: string) => {
    contentRef.current = html;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(titleRef.current, html), 2000);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    setTitle(t); titleRef.current = t;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(t, contentRef.current), 2000);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${title}"?`)) return;
    await wikiPages.delete(page.id);
    onDeleted();
  };

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const exportPDF = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:40px 48px;color:#111827;line-height:1.75;font-size:15px}h1{font-size:28px;font-weight:700;margin:0 0 6px}h2{font-size:22px;font-weight:600;margin:28px 0 6px}h3{font-size:18px;font-weight:600;margin:20px 0 5px}p{margin:0 0 10px}ul,ol{padding-left:24px;margin:0 0 10px}li{margin-bottom:3px}blockquote{border-left:3px solid #e5e7eb;padding-left:16px;color:#6b7280;font-style:italic;margin:16px 0}pre{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;overflow-x:auto;margin:14px 0;font-size:13px}code{background:#f3f4f6;border-radius:3px;padding:2px 5px;font-size:13px}pre code{background:none;padding:0}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #e5e7eb;padding:7px 11px;font-size:14px;text-align:left}th{background:#f9fafb;font-weight:600}hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}a{color:#3b82f6}mark{background:#fef9c3;padding:0 2px;border-radius:2px}.meta{color:#6b7280;font-size:13px;margin:4px 0 28px}@media print{body{padding:0}@page{margin:18mm}}</style>
</head><body>
<h1>${escHtml(title)}</h1>
<p class="meta">Last updated: ${format(new Date(page.updatedAt), 'MMMM d, yyyy')}</p>
${contentRef.current}
</body></html>`);
    w.document.close();
    w.onload = () => w.print();
  };

  const exportWord = () => {
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>${escHtml(title)}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>body{font-family:Calibri,sans-serif;font-size:12pt;line-height:1.5;color:#000}h1{font-size:24pt;font-weight:bold;margin-bottom:6pt}h2{font-size:18pt;font-weight:bold;margin-bottom:4pt}h3{font-size:14pt;font-weight:bold;margin-bottom:3pt}p{margin-bottom:8pt}ul,ol{padding-left:24pt}li{margin-bottom:3pt}blockquote{margin-left:20pt;color:#6b7280;font-style:italic}pre,code{font-family:Consolas,monospace;font-size:10pt;background:#f3f4f6}pre{padding:8pt;margin:8pt 0}table{border-collapse:collapse;width:100%}th,td{border:1pt solid #d1d5db;padding:6pt}th{background:#f9fafb;font-weight:bold}hr{border-top:1pt solid #e5e7eb}</style></head><body><h1>${escHtml(title)}</h1>${contentRef.current}</body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^\w\s-]/g, '').trim() || 'untitled'}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (content: string, restoredTitle: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    editorRef.current?.commands.setContent(content);
    contentRef.current = content;
    setTitle(restoredTitle); titleRef.current = restoredTitle;
    setShowHistory(false);
    await doSave(restoredTitle, content);
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    const c = await wikiComments.create(page.id, commentBody.trim(), replyTo ?? undefined);
    setComments(prev => replyTo ? prev.map(x => x.id === replyTo ? { ...x, replies: [...(x.replies ?? []), c] } : x) : [...prev, c]);
    setCommentBody(''); setReplyTo(null);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-surface-border bg-surface-card flex-shrink-0 gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft size={13} />Back
          </button>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <button onClick={exportPDF} title="Export as PDF"
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-elevated transition-colors">
              <FileDown size={12} />PDF
            </button>
            <button onClick={exportWord} title="Export as Word document"
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-elevated transition-colors">
              <FileDown size={12} />Word
            </button>
            <div className="w-px h-4 bg-surface-border mx-0.5" />
            <button onClick={() => { setShowAttachments(v => !v); setShowHistory(false); setShowComments(false); }}
              className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors',
                showAttachments ? 'bg-surface-elevated text-white' : 'text-gray-400 hover:text-white hover:bg-surface-elevated')}>
              <Paperclip size={12} />Files
            </button>
            <button onClick={() => { setShowHistory(v => !v); setShowComments(false); setShowAttachments(false); }}
              className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors',
                showHistory ? 'bg-surface-elevated text-white' : 'text-gray-400 hover:text-white hover:bg-surface-elevated')}>
              <History size={12} />History
            </button>
            <button onClick={() => { setShowComments(v => !v); setShowHistory(false); setShowAttachments(false); }}
              className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors',
                showComments ? 'bg-surface-elevated text-white' : 'text-gray-400 hover:text-white hover:bg-surface-elevated')}>
              <MessageSquare size={12} />Comments
            </button>
            <div className="w-px h-4 bg-surface-border mx-0.5" />
            <button onClick={onToggleFullWidth} title={fullWidth ? 'Narrow width' : 'Full width'}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-elevated transition-colors">
              {fullWidth ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button onClick={handleDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-surface-elevated transition-colors flex-shrink-0">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Formatting toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-4 py-1.5 border-b border-surface-border bg-surface-card flex-shrink-0">
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleBold().run()} title="Bold"><Bold size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleItalic().run()} title="Italic"><Italic size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleStrike().run()} title="Strike"><Strikethrough size={13} /></TB>
          <div className="w-px h-4 bg-surface-border mx-0.5" />
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run()} title="H1"><Heading1 size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run()} title="H2"><Heading2 size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 3 }).run()} title="H3"><Heading3 size={13} /></TB>
          <div className="w-px h-4 bg-surface-border mx-0.5" />
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleOrderedList().run()} title="Ordered list"><ListOrdered size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleTaskList().run()} title="To-do list"><CheckSquare size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleBlockquote().run()} title="Quote"><Quote size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().toggleCodeBlock().run()} title="Code block"><Code size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().setHorizontalRule().run()} title="Divider"><Minus size={13} /></TB>
          <TB active={false} onClick={() => { const url = prompt('URL:'); if (url) editorRef.current?.chain().focus().setLink({ href: url }).run(); }} title="Link"><LinkIcon size={13} /></TB>
          <TB active={false} onClick={() => editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Table"><TableIcon size={13} /></TB>
        </div>

        {/* Page header + content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className={cn(fullWidth ? 'max-w-none px-8' : 'max-w-3xl px-8', 'mx-auto w-full pt-8 flex-shrink-0')}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{page.emoji}</span>
              <input value={title} onChange={handleTitleChange} placeholder="Untitled"
                className="flex-1 text-2xl font-bold bg-transparent border-none outline-none text-white placeholder:text-gray-600" />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-6">
              <Avatar name={page.creator.name} />
              <span>{page.creator.name}</span>
              <span>·</span>
              <Ago date={page.updatedAt} />
            </div>
          </div>

          <RichEditor
            content={page.content || ''}
            onUpdate={schedSave}
            saveStatus={saveStatus}
            editorRef={editorRef}
            fullWidth={fullWidth}
          />
        </div>
      </div>

      {/* Attachments */}
      {showAttachments && (
        <AttachmentsPanel pageId={page.id} onClose={() => setShowAttachments(false)} />
      )}

      {/* Version history */}
      {showHistory && (
        <VersionHistoryPanel
          pageId={page.id}
          currentContent={contentRef.current}
          currentTitle={titleRef.current}
          onRestore={handleRestore}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Comments */}
      {showComments && (
        <div className="w-72 border-l border-surface-border flex-shrink-0 overflow-y-auto bg-surface-card">
          <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-card">
            <h3 className="text-sm font-semibold text-white">Comments</h3>
            <button onClick={() => setShowComments(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
          </div>
          <div className="p-4 space-y-4">
            <form onSubmit={handleComment} className="space-y-2">
              <textarea value={commentBody} onChange={e => setCommentBody(e.target.value)}
                placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'} rows={3}
                className="w-full bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500 resize-none" />
              <div className="flex justify-between items-center">
                {replyTo && <button type="button" onClick={() => setReplyTo(null)} className="text-xs text-gray-500 hover:text-white">Cancel reply</button>}
                <button type="submit" disabled={!commentBody.trim()}
                  className="ml-auto text-xs bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors">
                  {replyTo ? 'Reply' : 'Comment'}
                </button>
              </div>
            </form>
            {comments.length === 0 ? <p className="text-xs text-gray-500 text-center py-4">No comments yet</p>
              : <ul className="space-y-4">
                  {comments.map(c => (
                    <li key={c.id} className={cn('space-y-2', c.isResolved && 'opacity-50')}>
                      <div className="flex items-start gap-2">
                        <Avatar name={c.author.name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-medium text-white">{c.author.name}</span>
                            <span className="text-xs text-gray-500"><Ago date={c.createdAt} /></span>
                          </div>
                          <p className="text-xs text-gray-300 whitespace-pre-wrap">{c.body}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <button onClick={() => setReplyTo(c.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"><Reply size={10} />Reply</button>
                            {!c.isResolved && currentUser.id === c.author.id && (
                              <button onClick={async () => { await wikiComments.resolve(c.id); setComments(prev => prev.map(x => x.id === c.id ? { ...x, isResolved: true } : x)); }}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-400"><CheckCircle size={10} />Resolve</button>
                            )}
                          </div>
                        </div>
                      </div>
                      {(c.replies ?? []).length > 0 && (
                        <ul className="ml-8 space-y-2 pl-3 border-l border-surface-border">
                          {(c.replies ?? []).map(r => (
                            <li key={r.id} className="flex items-start gap-2">
                              <Avatar name={r.author.name} />
                              <div>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-xs font-medium text-white">{r.author.name}</span>
                                  <span className="text-xs text-gray-500"><Ago date={r.createdAt} /></span>
                                </div>
                                <p className="text-xs text-gray-300">{r.body}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Attachments panel ────────────────────────────────────────────────────────

function AttachmentsPanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [attachments, setAttachments] = useState<WAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    wikiAttachments.list(pageId).then(setAttachments).finally(() => setLoading(false));
  }, [pageId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await wikiAttachments.upload(pageId, file);
      setAttachments(prev => [att, ...prev]);
    } catch { /* upload failed */ }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (id: string, storedName: string) => {
    if (!confirm(`Remove attachment?`)) return;
    await wikiAttachments.delete(id);
    setAttachments(prev => prev.filter(a => a.id !== id));
    void storedName; // used in download link only
  };

  const fmt = (b: number) => b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`;

  const fileEmoji = (mime: string) => {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel')) return '📊';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑';
    if (mime.includes('zip') || mime.includes('archive')) return '🗜️';
    return '📎';
  };

  return (
    <div className="w-72 border-l border-surface-border flex-shrink-0 bg-surface-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Paperclip size={13} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-white">Attachments</h3>
          {attachments.length > 0 && <span className="text-xs text-gray-500">({attachments.length})</span>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <label className={cn(
          'flex items-center justify-center gap-2 w-full text-xs px-3 py-2.5 rounded-lg border border-dashed transition-colors cursor-pointer',
          uploading ? 'border-brand-600/50 text-brand-400 bg-brand-600/5' : 'border-surface-border text-gray-400 hover:border-brand-600/50 hover:text-brand-400 hover:bg-brand-600/5'
        )}>
          {uploading ? <Spinner /> : <FileUp size={13} />}
          {uploading ? 'Uploading…' : 'Upload a file'}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        {loading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No attachments yet</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map(a => (
              <li key={a.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-elevated group">
                <span className="text-base flex-shrink-0">{fileEmoji(a.mimeType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate" title={a.filename}>{a.filename}</p>
                  <p className="text-xs text-gray-500">{fmt(a.size)}</p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <a href={`/wiki-api/uploads/${a.storedName}`} download={a.filename}
                    className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-surface-border transition-colors"
                    title="Download">
                    <FileDown size={12} />
                  </a>
                  <button onClick={() => handleDelete(a.id, a.storedName)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-surface-border transition-colors"
                    title="Remove">
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Space view ───────────────────────────────────────────────────────────────

function SpaceView({ space, onBack, currentUser }: {
  space: WSpace; onBack: () => void; currentUser: WUser;
}) {
  const [tree, setTree] = useState<WPageNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [activePage, setActivePage] = useState<WPage | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [fullWidth, setFullWidth] = useState(false);
  const dragIdRef = useRef<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DragIndicator>({ overId: null, position: 'before' });

  const refreshTree = useCallback(() => { wikiPages.tree(space.key).then(setTree); }, [space.key]);

  useEffect(() => { wikiPages.tree(space.key).then(setTree).finally(() => setTreeLoading(false)); }, [space.key]);

  const loadPage = async (id: string) => {
    setPageLoading(true); setActivePage(null);
    try { setActivePage(await wikiPages.get(id)); } finally { setPageLoading(false); }
  };

  const addPage = async (parentId?: string) => {
    const p = await wikiPages.create(space.key, { parentId, title: 'Untitled' });
    const nn: WPageNode = { id: p.id, title: p.title, emoji: p.emoji, parentId: parentId ?? null, position: 0, children: [] };
    if (parentId) setTree(prev => { const ins = (ns: WPageNode[]): WPageNode[] => ns.map(n => n.id === parentId ? { ...n, children: [...n.children, nn] } : { ...n, children: ins(n.children) }); return ins(prev); });
    else setTree(prev => [...prev, nn]);
    loadPage(p.id);
  };

  const handleMove = async (dragId: string, targetId: string, pos: 'before' | 'into' | 'after') => {
    const target = findNode(tree, targetId);
    if (!target) return;
    const dragged = findNode(tree, dragId);
    if (!dragged) return;
    const newParentId = pos === 'into' ? targetId : target.parentId;
    const newPosition = pos === 'into'
      ? (target.children.length > 0 ? Math.max(...target.children.map(c => c.position)) + 1 : 0)
      : pos === 'before' ? target.position - 0.5 : target.position + 0.5;
    const [without] = removeNode(tree, dragId);
    setTree(insertNode(without, dragged, newParentId, newPosition));
    try { await wikiPages.move(dragId, newParentId, newPosition); } finally { refreshTree(); }
  };

  const dragProps: DragProps = { dragIdRef, indicator: dropIndicator, setIndicator: setDropIndicator, onMove: handleMove };

  const flatSearch = (nodes: WPageNode[], q: string): WPageNode[] =>
    nodes.flatMap(n => [...(n.title.toLowerCase().includes(q.toLowerCase()) ? [n] : []), ...flatSearch(n.children, q)]);
  const filtered = search ? flatSearch(tree, search) : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — hidden in full-width mode */}
      <div className={cn('w-56 flex-shrink-0 border-r border-surface-border flex flex-col bg-surface-card overflow-hidden transition-all',
        fullWidth && activePage && 'hidden')}>
        <div className="px-3 py-3 border-b border-surface-border">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mb-2 transition-colors"><ArrowLeft size={12} />All spaces</button>
          <div className="flex items-center gap-2">
            <span className="text-xl">{space.iconEmoji}</span>
            <span className="font-medium text-sm text-white truncate">{space.name}</span>
            <button onClick={() => addPage()} title="New page" className="ml-auto p-1 rounded hover:bg-surface-elevated text-gray-500 hover:text-white flex-shrink-0"><Plus size={13} /></button>
          </div>
        </div>
        <div className="px-2 py-2 border-b border-surface-border">
          <div className="flex items-center gap-1.5 bg-surface-elevated rounded-md px-2 py-1.5">
            <Search size={11} className="text-gray-500 flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pages…"
              className="flex-1 bg-transparent text-xs text-white placeholder:text-gray-500 outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            const id = e.dataTransfer.getData('pageId');
            if (id) {
              const d = findNode(tree, id);
              if (d && d.parentId !== null) void handleMove(id, tree[tree.length - 1]?.id ?? id, 'after');
            }
            setDropIndicator({ overId: null, position: 'before' });
          }}
        >
          {treeLoading ? <div className="flex justify-center pt-8"><Spinner /></div>
            : filtered !== null ? (
              filtered.length === 0 ? <p className="text-xs text-gray-500 text-center pt-6">No pages match</p>
                : <ul>{filtered.map(n => <li key={n.id}><button onClick={() => loadPage(n.id)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-elevated hover:text-white rounded-md"><span>{n.emoji}</span><span className="truncate">{n.title}</span></button></li>)}</ul>
            ) : tree.length === 0 ? (
              <div className="text-center pt-8 px-4"><p className="text-xs text-gray-500 mb-2">No pages yet</p><button onClick={() => addPage()} className="text-xs text-brand-400 hover:underline">Create first page</button></div>
            ) : (
              <ul>{tree.map(n => <PageTreeItem key={n.id} node={n} depth={0} activeId={activePage?.id} onSelect={loadPage} onAdd={addPage} drag={dragProps} />)}</ul>
            )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {pageLoading ? <div className="flex items-center justify-center h-full"><Spinner /></div>
          : activePage ? (
            <PageEditorView
              page={activePage}
              currentUser={currentUser}
              fullWidth={fullWidth}
              onToggleFullWidth={() => setFullWidth(v => !v)}
              onBack={() => { setActivePage(null); setFullWidth(false); }}
              onSaved={p => { setActivePage(p); setTree(prev => { const up = (ns: WPageNode[]): WPageNode[] => ns.map(n => n.id === p.id ? { ...n, title: p.title, emoji: p.emoji } : { ...n, children: up(n.children) }); return up(prev); }); }}
              onDeleted={() => { setActivePage(null); setFullWidth(false); refreshTree(); }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-3">{space.iconEmoji}</div>
              <h2 className="text-base font-semibold text-white mb-1">{space.name}</h2>
              {space.description && <p className="text-sm text-gray-500 mb-4 max-w-xs">{space.description}</p>}
              <button onClick={() => addPage()} className="flex items-center gap-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg transition-colors"><Plus size={14} />Create first page</button>
            </div>
          )}
      </div>
    </div>
  );
}

// ─── Root WikiModule ──────────────────────────────────────────────────────────

const WIKI_EMAIL = 'wiki@prm.internal';
const WIKI_NAME  = 'PRM User';
const WIKI_PASS  = 'wiki-prm-default';

type View = 'loading' | 'spaces' | 'space';

export function WikiModule() {
  const [view, setView] = useState<View>('loading');
  const [user, setUser] = useState<WUser | null>(null);
  const [spaces, setSpaces] = useState<WSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [activeSpace, setActiveSpace] = useState<WSpace | null>(null);
  const [authError, setAuthError] = useState('');

  const loadSpaces = useCallback(() => {
    setSpacesLoading(true);
    wikiSpaces.list().then(setSpaces).finally(() => setSpacesLoading(false));
  }, []);

  const autoAuth = useCallback(async () => {
    const stored = getWikiAuth();
    if (stored?.accessToken) {
      try { const u = await wikiAuth.me(); setUser(u); loadSpaces(); setView('spaces'); return; }
      catch { clearWikiAuth(); }
    }
    try {
      const r = await wikiAuth.login(WIKI_EMAIL, WIKI_PASS);
      setWikiAuth(r.tokens, r.user); setUser(r.user); loadSpaces(); setView('spaces'); return;
    } catch { /* not registered */ }
    try {
      const r = await wikiAuth.register(WIKI_EMAIL, WIKI_NAME, WIKI_PASS);
      setWikiAuth(r.tokens, r.user); setUser(r.user); loadSpaces(); setView('spaces');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setAuthError(msg ?? 'Wiki server unavailable. Make sure it is running.');
    }
  }, [loadSpaces]);

  useEffect(() => { void autoAuth(); }, [autoAuth]);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
      <div className="flex items-center px-4 py-2 border-b border-surface-border bg-surface-card flex-shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span>📄</span><span>Wiki</span>
          {view === 'space' && activeSpace && (<><ChevronRight size={13} className="text-gray-500" /><span className="text-gray-300">{activeSpace.iconEmoji} {activeSpace.name}</span></>)}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {view === 'loading' && (
          <div className="flex items-center justify-center h-full">
            {authError
              ? <div className="text-center"><p className="text-red-400 text-sm mb-2">{authError}</p><button onClick={() => { setAuthError(''); setView('loading'); void autoAuth(); }} className="text-xs text-brand-400 hover:underline">Retry</button></div>
              : <Spinner />}
          </div>
        )}
        {view === 'spaces' && (
          <div className="overflow-y-auto h-full p-6">
            <SpaceList spaces={spaces} loading={spacesLoading}
              onSelect={s => { setActiveSpace(s); setView('space'); }}
              onCreate={s => { setSpaces(prev => [s, ...prev]); setActiveSpace(s); setView('space'); }}
            />
          </div>
        )}
        {view === 'space' && activeSpace && user && (
          <SpaceView space={activeSpace} currentUser={user} onBack={() => { setView('spaces'); setActiveSpace(null); }} />
        )}
      </div>

      <style>{`
        .wiki-prose { flex: 1; }
        .wiki-prose .ProseMirror { outline: none; color: #e5e7eb; line-height: 1.75; min-height: 400px; font-size: 0.9375rem; }
        .wiki-prose .ProseMirror > * + * { margin-top: 0.5rem; }
        .wiki-prose .ProseMirror h1 { font-size: 1.75rem; font-weight: 700; color: #fff; margin-top: 1.75rem; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
        .wiki-prose .ProseMirror h2 { font-size: 1.35rem; font-weight: 600; color: #f3f4f6; margin-top: 1.5rem; margin-bottom: 0.4rem; }
        .wiki-prose .ProseMirror h3 { font-size: 1.1rem; font-weight: 600; color: #f3f4f6; margin-top: 1.25rem; margin-bottom: 0.3rem; }
        .wiki-prose .ProseMirror p { color: #d1d5db; }
        .wiki-prose .ProseMirror p.is-empty::before { content: attr(data-placeholder); color: #4b5563; pointer-events: none; float: left; height: 0; }
        .wiki-prose .ProseMirror ul { list-style: disc; padding-left: 1.5rem; }
        .wiki-prose .ProseMirror ol { list-style: decimal; padding-left: 1.5rem; }
        .wiki-prose .ProseMirror li { color: #d1d5db; margin-bottom: 0.15rem; }
        .wiki-prose .ProseMirror li > p { margin: 0; }
        .wiki-prose .ProseMirror blockquote { border-left: 3px solid #4b5563; padding-left: 1rem; color: #9ca3af; font-style: italic; margin: 1rem 0; }
        .wiki-prose .ProseMirror pre { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 1rem 1.25rem; overflow-x: auto; margin: 1rem 0; }
        .wiki-prose .ProseMirror pre code { background: none; color: #e2e8f0; font-size: 0.85em; padding: 0; }
        .wiki-prose .ProseMirror code:not(pre code) { background: #1e293b; border: 1px solid #334155; border-radius: 4px; padding: 0.1rem 0.4rem; font-size: 0.85em; color: #93c5fd; }
        .wiki-prose .ProseMirror table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        .wiki-prose .ProseMirror th { background: #1e293b; font-weight: 600; color: #f1f5f9; text-align: left; }
        .wiki-prose .ProseMirror th, .wiki-prose .ProseMirror td { border: 1px solid #334155; padding: 0.5rem 0.75rem; color: #d1d5db; }
        .wiki-prose .ProseMirror hr { border: none; border-top: 1px solid #374151; margin: 1.5rem 0; }
        .wiki-prose .ProseMirror a { color: #60a5fa; text-decoration: underline; }
        .wiki-prose .ProseMirror mark { background: #fef08a22; color: #fef08a; border-radius: 2px; padding: 0 2px; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.25rem; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li > label { margin-top: 2px; flex-shrink: 0; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li input[type="checkbox"] { width: 14px; height: 14px; accent-color: #6366f1; cursor: pointer; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { opacity: 0.5; text-decoration: line-through; }
        .wiki-prose .ProseMirror .selectedCell { background: #3730a330; }
      `}</style>
    </div>
  );
}
