import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps, type Editor } from '@tiptap/react';
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
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
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import CharacterCount from '@tiptap/extension-character-count';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import {
  Plus, ChevronRight, ChevronDown, Bold, Italic, Underline as UnderlineIcon,
  Link as LinkIcon, ArrowLeft, Trash2, MessageSquare,
  CheckCircle, Reply, X, Search,
  List, ListOrdered, Quote, Code, Minus, History, RotateCcw,
  Strikethrough, Highlighter, Table as TableIcon, CheckSquare,
  Type, Hash, Paperclip, FileDown, Maximize2, Minimize2, FileUp,
  MoreHorizontal, Globe, Lock, Users as UsersIcon, ChevronsLeftRight, Edit2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Image as ImageIcon, Eraser,
  Folder, FolderOpen, FileText, GripVertical, BookOpen,
} from 'lucide-react';

const lowlight = createLowlight(common);
import { formatDistanceToNow, format } from 'date-fns';
import {
  wikiAuth, wikiSpaces, wikiPages, wikiComments, wikiAttachments, wikiUsers,
  getWikiAuth, setWikiAuth, clearWikiAuth,
  type WUser, type WSpace, type WSpaceMember, type WPageNode, type WPage, type WComment,
  type WVersion, type WVersionDetail, type WAttachment,
} from './wikiApi';
import { useAuthStore } from '../../store/auth';

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
  {
    id: 'spreadsheet', label: 'Spreadsheet', description: 'Excel-like data grid',
    icon: <TableIcon size={14} />,
    action: e => e.chain().focus().insertContent({ type: 'spreadsheet', attrs: { data: makeSheetData() } }).run(),
  },
  { id: 'divider', label: 'Divider', description: 'Horizontal line', icon: <Minus size={14} />, action: e => e.chain().focus().setHorizontalRule().run() },
];

// ─── Diff algorithm ───────────────────────────────────────────────────────────

type DiffToken =
  | { type: 'equal'; text: string }
  | { type: 'added'; text: string }
  | { type: 'removed'; text: string }
  | { type: 'replaced'; oldText: string; newText: string };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function lcsWordDiff(oldHtml: string, newHtml: string): DiffToken[] {
  const oldWords = stripHtml(oldHtml).split(' ').filter(Boolean);
  const newWords = stripHtml(newHtml).split(' ').filter(Boolean);
  const m = oldWords.length, n = newWords.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldWords[i - 1] === newWords[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const ops: ('equal' | 'remove' | 'insert')[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) { ops.unshift('equal'); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { ops.unshift('insert'); j--; }
    else { ops.unshift('remove'); i--; }
  }

  let oi = 0, ni = 0;
  const raw: { type: 'equal' | 'remove' | 'insert'; text: string }[] = [];
  for (const op of ops) {
    if (op === 'equal') { raw.push({ type: 'equal', text: oldWords[oi++] }); ni++; }
    else if (op === 'remove') { raw.push({ type: 'remove', text: oldWords[oi++] }); }
    else { raw.push({ type: 'insert', text: newWords[ni++] }); }
  }

  const tokens: DiffToken[] = [];
  let k = 0;
  while (k < raw.length) {
    const cur = raw[k];
    if (cur.type === 'remove' && k + 1 < raw.length && raw[k + 1].type === 'insert') {
      tokens.push({ type: 'replaced', oldText: cur.text, newText: raw[k + 1].text });
      k += 2;
    } else if (cur.type === 'equal') {
      tokens.push({ type: 'equal', text: cur.text }); k++;
    } else if (cur.type === 'remove') {
      tokens.push({ type: 'removed', text: cur.text }); k++;
    } else {
      tokens.push({ type: 'added', text: cur.text }); k++;
    }
  }
  return tokens;
}

function DiffView({ oldHtml, newHtml }: { oldHtml: string; newHtml: string }) {
  const tokens = lcsWordDiff(oldHtml, newHtml);
  const hasChanges = tokens.some(t => t.type !== 'equal');
  return (
    <div className="p-4">
      <div className="flex gap-3 mb-3 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/30 border border-green-500/50 inline-block" />Added
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/50 inline-block" />Deleted
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/30 border border-orange-500/50 inline-block" />Changed
        </span>
      </div>
      {!hasChanges ? (
        <p className="text-xs text-gray-500 italic">No differences from current version.</p>
      ) : (
        <p className="text-xs text-gray-300 leading-7">
          {tokens.map((t, idx) => {
            if (t.type === 'equal') return <span key={idx}>{t.text} </span>;
            if (t.type === 'added') return <span key={idx} className="bg-green-100 text-green-700 rounded px-0.5 mx-0.5">{t.text} </span>;
            if (t.type === 'removed') return <span key={idx} className="bg-red-100 text-red-700 line-through rounded px-0.5 mx-0.5">{t.text} </span>;
            if (t.type === 'replaced') return (
              <span key={idx}>
                <span className="bg-orange-100 text-orange-700 line-through rounded px-0.5 mx-0.5">{t.oldText} </span>
                <span className="bg-orange-100 text-orange-700 font-medium rounded px-0.5 mx-0.5">{t.newText} </span>
              </span>
            );
            return null;
          })}
        </p>
      )}
    </div>
  );
}

// ─── Spreadsheet Block ────────────────────────────────────────────────────────

interface SheetCell { v: string; b?: boolean; i?: boolean; tc?: string; bg?: string; al?: 'l' | 'c' | 'r' }

const makeSheetData = (rows = 5, cols = 4): SheetCell[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ v: '' })));

const colLetter = (c: number): string => {
  let s = ''; let n = c + 1;
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};

const SHEET_BG_COLORS = [
  '', '#1e293b', '#431407', '#422006', '#14532d', '#0c4a6e', '#2e1065', '#4c0519', '#52525b',
];

function SpreadsheetView({ node, updateAttributes }: NodeViewProps) {
  type Pos = [number, number];
  const raw = node.attrs.data as SheetCell[][] | null;
  const [data, setData] = useState<SheetCell[][]>(() => (raw && raw.length > 0 ? raw : makeSheetData()));
  const [sel, setSel] = useState<Pos | null>(null);

  useEffect(() => {
    if (raw && raw.length > 0) setData(raw);
  }, [node.attrs.data]);

  const rows = data.length;
  const cols = data[0]?.length ?? 4;
  const selCell = sel ? data[sel[0]]?.[sel[1]] : null;

  const commit = (next: SheetCell[][]) => { setData(next); updateAttributes({ data: next }); };

  const setCell = (r: number, c: number, patch: Partial<SheetCell>) =>
    commit(data.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? { ...cell, ...patch } : cell)));

  const patchSel = (patch: Partial<SheetCell>) => { if (sel) setCell(sel[0], sel[1], patch); };

  const addRow = () => commit([...data, Array.from({ length: cols }, () => ({ v: '' }))]);
  const addCol = () => commit(data.map(row => [...row, { v: '' }]));
  const delRow = (r: number) => {
    if (rows <= 1) return;
    commit(data.filter((_, ri) => ri !== r));
    if (sel && sel[0] >= rows - 1) setSel(null);
  };
  const delCol = (c: number) => {
    if (cols <= 1) return;
    commit(data.map(row => row.filter((_, ci) => ci !== c)));
    if (sel && sel[1] >= cols - 1) setSel(null);
  };
  const sortByCol = (c: number, asc: boolean) => {
    if (rows <= 1) return;
    const [header, ...body] = data;
    const sorted = [...body].sort((a, b) => {
      const va = a[c]?.v ?? '', vb = b[c]?.v ?? '';
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    commit([header, ...sorted]);
  };

  const sr = sel ? sel[0] : -1;
  const sc = sel ? sel[1] : -1;

  return (
    <NodeViewWrapper>
      <div className="my-3 rounded-xl border border-white/10 overflow-hidden" contentEditable={false}>
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
          <button onMouseDown={e => { e.preventDefault(); patchSel({ b: !selCell?.b }); }}
            title="Bold"
            className={cn('h-6 w-6 flex items-center justify-center rounded text-xs transition-colors',
              selCell?.b ? 'bg-brand-600/30 text-brand-300' : 'text-gray-500 hover:bg-white/8 hover:text-white')}>
            <Bold size={11} />
          </button>
          <button onMouseDown={e => { e.preventDefault(); patchSel({ i: !selCell?.i }); }}
            title="Italic"
            className={cn('h-6 w-6 flex items-center justify-center rounded text-xs transition-colors',
              selCell?.i ? 'bg-brand-600/30 text-brand-300' : 'text-gray-500 hover:bg-white/8 hover:text-white')}>
            <Italic size={11} />
          </button>

          <div className="w-px h-4 bg-white/8 mx-0.5" />
          {(['l', 'c', 'r'] as const).map((al, idx) => (
            <button key={al} onMouseDown={e => { e.preventDefault(); patchSel({ al }); }}
              title={['Align left', 'Align center', 'Align right'][idx]}
              className={cn('h-6 w-6 flex items-center justify-center rounded text-xs transition-colors',
                selCell?.al === al ? 'bg-brand-600/30 text-brand-300' : 'text-gray-500 hover:bg-white/8 hover:text-white')}>
              {idx === 0 ? <AlignLeft size={10} /> : idx === 1 ? <AlignCenter size={10} /> : <AlignRight size={10} />}
            </button>
          ))}

          <div className="w-px h-4 bg-white/8 mx-0.5" />
          <span className="text-label text-gray-600">Fill:</span>
          {SHEET_BG_COLORS.map((bg, idx) => (
            <button key={idx}
              onMouseDown={e => { e.preventDefault(); patchSel({ bg: bg || undefined }); }}
              title={bg || 'No fill'}
              className="w-3.5 h-3.5 rounded-sm border border-white/15 hover:scale-110 transition-transform flex-shrink-0"
              style={{ background: bg || 'transparent' }}
            />
          ))}

          <div className="w-px h-4 bg-white/8 mx-0.5" />
          {sel && (
            <>
              <button onMouseDown={e => { e.preventDefault(); delRow(sel[0]); }} title="Delete selected row"
                className="h-6 px-1.5 flex items-center rounded text-label text-red-400 hover:bg-red-500/10 transition-colors">−Row</button>
              <button onMouseDown={e => { e.preventDefault(); delCol(sel[1]); }} title="Delete selected column"
                className="h-6 px-1.5 flex items-center rounded text-label text-red-400 hover:bg-red-500/10 transition-colors">−Col</button>
              <div className="w-px h-4 bg-white/8 mx-0.5" />
            </>
          )}
          <button onMouseDown={e => { e.preventDefault(); addRow(); }} title="Add row"
            className="h-6 px-1.5 flex items-center rounded text-label text-emerald-400 hover:bg-emerald-500/10 transition-colors">+Row</button>
          <button onMouseDown={e => { e.preventDefault(); addCol(); }} title="Add column"
            className="h-6 px-1.5 flex items-center rounded text-label text-emerald-400 hover:bg-emerald-500/10 transition-colors">+Col</button>

          {sel && (
            <span className="ml-auto text-label text-gray-600 font-mono">{colLetter(sel[1])}{sel[0] + 1}</span>
          )}
        </div>

        {/* Grid */}
        <div className="overflow-auto" style={{ maxHeight: '320px' }}>
          <table className="border-collapse text-label w-full bg-surface" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="w-7 min-w-[28px] bg-gray-50 border border-gray-200 text-label text-gray-500 select-none sticky top-0 z-20" />
                {Array.from({ length: cols }, (_, ci) => (
                  <th key={ci}
                    className={cn('bg-gray-50 border border-gray-200 text-label font-semibold px-1 py-0.5 min-w-[90px] select-none sticky top-0 z-20 group',
                      sc === ci ? 'text-brand-600 bg-brand-100' : 'text-gray-500')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>{colLetter(ci)}</span>
                      <span className="hidden group-hover:flex gap-px">
                        <button onMouseDown={e => { e.preventDefault(); sortByCol(ci, true); }} title="Sort A→Z"
                          className="text-label text-gray-400 hover:text-gray-900 leading-none">↑</button>
                        <button onMouseDown={e => { e.preventDefault(); sortByCol(ci, false); }} title="Sort Z→A"
                          className="text-label text-gray-400 hover:text-gray-900 leading-none">↓</button>
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, ri) => (
                <tr key={ri}>
                  <td className={cn(
                    'bg-gray-50 border border-gray-200 text-center text-label w-7 select-none',
                    sr === ri ? 'text-brand-600 bg-brand-100' : 'text-gray-600',
                  )}>
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci}
                      onClick={() => setSel([ri, ci])}
                      className={cn('border p-0 relative',
                        sr === ri && sc === ci ? 'border-brand-400 outline outline-1 outline-brand-400 z-10' : 'border-white/8')}
                      style={{ backgroundColor: cell.bg ?? undefined }}
                    >
                      <input
                        value={cell.v}
                        onChange={e => setCell(ri, ci, { v: e.target.value })}
                        onFocus={() => setSel([ri, ci])}
                        className="w-full px-1.5 py-1 bg-transparent outline-none block"
                        style={{
                          fontWeight: cell.b ? 'bold' : 'normal',
                          fontStyle: cell.i ? 'italic' : 'normal',
                          color: cell.tc ?? '#d1d5db',
                          textAlign: cell.al === 'c' ? 'center' : cell.al === 'r' ? 'right' : 'left',
                          minWidth: '90px',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const SpreadsheetBlock = TiptapNode.create({
  name: 'spreadsheet',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      data: {
        default: makeSheetData(),
        parseHTML: el => { try { return JSON.parse(el.getAttribute('data-sheet') ?? ''); } catch { return makeSheetData(); } },
        renderHTML: attrs => ({ 'data-sheet': JSON.stringify(attrs.data) }),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="spreadsheet"]' }]; },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'spreadsheet', class: 'spreadsheet-block' })];
  },

  addNodeView() { return ReactNodeViewRenderer(SpreadsheetView); },

  addCommands() {
    return {
      insertSpreadsheet: () => ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) =>
        commands.insertContent({ type: this.name, attrs: { data: makeSheetData() } }),
    } as never;
  },
});

// ─── Rich Editor ─────────────────────────────────────────────────────────────

const TEXT_COLORS = ['#ffffff','#e2e8f0','#94a3b8','#64748b','#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899'];
const HIGHLIGHT_COLORS = ['#fef08a','#bbf7d0','#bfdbfe','#ddd6fe','#fecdd3','#fed7aa','#e0f2fe','#dcfce7'];

function Sep() { return <div className="w-px h-5 bg-gray-700 mx-1 flex-shrink-0" />; }

function TBtn({ active, onClick, title, children, danger }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn(
        'h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded text-xs transition-all select-none flex-shrink-0',
        active
          ? 'bg-brand-600/30 text-brand-300 ring-1 ring-brand-500/40'
          : danger
          ? 'text-gray-500 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
      )}>
      {children}
    </button>
  );
}

function ColorPicker({ label, colors, onPick, current, isHighlight }: {
  label: React.ReactNode; colors: string[]; onPick: (c: string) => void; current?: string; isHighlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        title={isHighlight ? 'Highlight color' : 'Text color'}
        className={cn('h-7 px-1.5 flex flex-col items-center justify-center gap-0.5 rounded transition-all',
          open ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100')}>
        <span className="text-xs leading-none">{label}</span>
        <span className="w-4 h-1 rounded-sm" style={{ background: current ?? (isHighlight ? '#fef08a' : '#ffffff') }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 grid grid-cols-6 gap-1">
          {colors.map(c => (
            <button key={c} onMouseDown={e => { e.preventDefault(); onPick(c); setOpen(false); }}
              className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform"
              style={{ background: c }} title={c} />
          ))}
          <button onMouseDown={e => { e.preventDefault(); onPick(''); setOpen(false); }}
            className="col-span-6 mt-1 text-xs text-gray-400 hover:text-white py-0.5 rounded hover:bg-gray-100 transition-colors">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function BlockStyleSelect({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const styles = [
    { label: 'Normal text', action: () => editor.chain().focus().setParagraph().run(), active: () => editor.isActive('paragraph') },
    { label: 'Heading 1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor.isActive('heading', { level: 1 }) },
    { label: 'Heading 2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor.isActive('heading', { level: 2 }) },
    { label: 'Heading 3', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor.isActive('heading', { level: 3 }) },
    { label: 'Heading 4', action: () => editor.chain().focus().toggleHeading({ level: 4 }).run(), active: () => editor.isActive('heading', { level: 4 }) },
    { label: 'Quote', action: () => editor.chain().focus().toggleBlockquote().run(), active: () => editor.isActive('blockquote') },
    { label: 'Code block', action: () => editor.chain().focus().toggleCodeBlock().run(), active: () => editor.isActive('codeBlock') },
  ];

  const current = styles.find(s => s.active())?.label ?? 'Normal text';

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className="h-7 px-2 flex items-center gap-1.5 rounded text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all min-w-[110px] justify-between">
        <span className="truncate">{current}</span>
        <ChevronDown size={10} className={cn('transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[160px]">
          {styles.map(s => (
            <button key={s.label} onMouseDown={e => { e.preventDefault(); s.action(); setOpen(false); }}
              className={cn('w-full text-left px-3 py-1.5 text-xs transition-colors',
                s.active() ? 'bg-brand-100 text-brand-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TableToolbar({ editor }: { editor: Editor }) {
  if (!editor.isActive('table')) return null;
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 bg-gray-50 flex-shrink-0 flex-wrap">
      <span className="text-xs text-gray-500 mr-1.5">Table:</span>
      <TBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="Add row above">↑ Row</TBtn>
      <TBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row below">↓ Row</TBtn>
      <TBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add column left">← Col</TBtn>
      <TBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add column right">→ Col</TBtn>
      <Sep />
      <TBtn onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row" danger>✕ Row</TBtn>
      <TBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete column" danger>✕ Col</TBtn>
      <TBtn onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table" danger>✕ Table</TBtn>
      <Sep />
      <TBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="Toggle header row" active={false}>Header row</TBtn>
      <TBtn onClick={() => editor.chain().focus().mergeCells().run()} title="Merge cells" active={false}>Merge</TBtn>
      <TBtn onClick={() => editor.chain().focus().splitCell().run()} title="Split cell" active={false}>Split</TBtn>
    </div>
  );
}

function RichEditorToolbar({ editor }: { editor: Editor }) {
  const currentColor = editor.getAttributes('textStyle').color as string | undefined;
  const currentHighlight = editor.getAttributes('highlight').color as string | undefined;

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">
      {/* Main toolbar row */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 flex-wrap min-h-[40px]">

        {/* Block style */}
        <BlockStyleSelect editor={editor} />
        <Sep />

        {/* Text format */}
        <TBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)"><Bold size={13} /></TBtn>
        <TBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)"><Italic size={13} /></TBtn>
        <TBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)"><UnderlineIcon size={13} /></TBtn>
        <TBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough size={13} /></TBtn>
        <TBtn active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript">
          <span className="text-label font-medium leading-none">x<sub>2</sub></span>
        </TBtn>
        <TBtn active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript">
          <span className="text-label font-medium leading-none">x<sup>2</sup></span>
        </TBtn>
        <Sep />

        {/* Color */}
        <ColorPicker
          label={<span className="font-bold text-sm leading-none" style={{ color: currentColor ?? '#ffffff' }}>A</span>}
          colors={TEXT_COLORS}
          current={currentColor}
          onPick={c => c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run()}
        />
        <ColorPicker
          label={<Highlighter size={11} />}
          colors={HIGHLIGHT_COLORS}
          current={currentHighlight}
          isHighlight
          onPick={c => c ? editor.chain().focus().toggleHighlight({ color: c }).run() : editor.chain().focus().unsetHighlight().run()}
        />
        <TBtn active={false} onClick={() => editor.chain().focus().unsetAllMarks().run()} title="Clear formatting"><Eraser size={13} /></TBtn>
        <Sep />

        {/* Alignment */}
        <TBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left"><AlignLeft size={13} /></TBtn>
        <TBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align center"><AlignCenter size={13} /></TBtn>
        <TBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right"><AlignRight size={13} /></TBtn>
        <TBtn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify"><AlignJustify size={13} /></TBtn>
        <Sep />

        {/* Lists */}
        <TBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={13} /></TBtn>
        <TBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered size={13} /></TBtn>
        <TBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list"><CheckSquare size={13} /></TBtn>
        <TBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote"><Quote size={13} /></TBtn>
        <Sep />

        {/* Insert */}
        <TBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code"><Code size={13} /></TBtn>
        <TBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
          <span className="text-label font-mono leading-none">{'{}'}</span>
        </TBtn>
        <TBtn active={editor.isActive('link')} onClick={() => {
          if (editor.isActive('link')) { editor.chain().focus().unsetLink().run(); return; }
          const url = prompt('Enter URL:');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }} title="Insert link"><LinkIcon size={13} /></TBtn>
        <TBtn active={false} onClick={() => {
          const url = prompt('Image URL:');
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }} title="Insert image"><ImageIcon size={13} /></TBtn>
        <TBtn active={editor.isActive('table')} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table"><TableIcon size={13} /></TBtn>
        <TBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule"><Minus size={13} /></TBtn>
        <Sep />

        {/* Font family */}
        <TBtn active={editor.isActive({ fontFamily: 'Georgia, serif' })} onClick={() => editor.chain().focus().setFontFamily('Georgia, serif').run()} title="Serif">
          <span className="text-label" style={{ fontFamily: 'Georgia, serif' }}>Serif</span>
        </TBtn>
        <TBtn active={editor.isActive({ fontFamily: 'Consolas, monospace' })} onClick={() => editor.chain().focus().setFontFamily('Consolas, monospace').run()} title="Monospace">
          <span className="text-label font-mono">Mono</span>
        </TBtn>
        <TBtn active={false} onClick={() => editor.chain().focus().unsetFontFamily().run()} title="Reset font">
          <span className="text-label">Sans</span>
        </TBtn>

      </div>

      {/* Table controls — shown when cursor is inside a table */}
      <TableToolbar editor={editor} />
    </div>
  );
}

function RichEditor({
  content, onUpdate, editorRef, fullWidth,
}: {
  content: string;
  onUpdate: (html: string) => void;
  editorRef: React.MutableRefObject<Editor | null>;
  fullWidth?: boolean;
}) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const [, forceUpdate] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'wiki-link' } }),
      Image.configure({ HTMLAttributes: { class: 'wiki-img' } }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      Typography,
      TextStyle,
      Color,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Subscript,
      Superscript,
      CharacterCount,
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: 'Start writing, or type / for commands…' }),
      SpreadsheetBlock,
    ],
    content,
    editable: true,
    onUpdate: ({ editor: e }) => { onUpdate(e.getHTML()); forceUpdate(n => n + 1); },
    onSelectionUpdate: () => forceUpdate(n => n + 1),
  });

  useEffect(() => { editorRef.current = editor; }, [editor, editorRef]);

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
        } else { setSlashMenu(null); }
      } catch { setSlashMenu(null); }
    };
    editor.on('update', handler);
    editor.on('selectionUpdate', handler);
    return () => { editor.off('update', handler); editor.off('selectionUpdate', handler); };
  }, [editor]);

  useEffect(() => {
    if (!editor || !slashMenu) return;
    const filtered = SLASH_COMMANDS.filter(c =>
      !slashMenu.query || c.label.toLowerCase().includes(slashMenu.query) || c.id.includes(slashMenu.query)
    );
    const handler = (e: KeyboardEvent) => {
      if (!slashMenu) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filtered.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + filtered.length) % filtered.length); }
      else if (e.key === 'Enter') { e.preventDefault(); const cmd = filtered[slashIdx]; if (cmd) executeSlash(cmd); }
      else if (e.key === 'Escape') { e.preventDefault(); setSlashMenu(null); }
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

  const words = editor?.storage.characterCount?.words() ?? 0;
  const chars = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {editor && <RichEditorToolbar editor={editor} />}

      <div className="flex-1 overflow-y-auto">
        <div className={cn(fullWidth ? 'max-w-none px-10' : 'max-w-3xl px-10', 'mx-auto pb-16 pt-2')}>
          <EditorContent editor={editor} className="wiki-prose" />
        </div>
      </div>

      {/* Footer: word count */}
      <div className="flex-shrink-0 px-6 py-1.5 border-t border-gray-200 bg-gray-50 flex items-center gap-4">
        <span className="text-xs text-gray-500">{words} words · {chars} characters</span>
        <span className="text-xs text-gray-500 ml-auto">Type <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-label">/</kbd> for commands</span>
      </div>

      {/* Slash command menu */}
      {slashMenu && filteredCmds.length > 0 && (
        <div className="fixed z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ left: slashMenu.x, top: slashMenu.y + 4 }}>
          <div className="px-3 py-2 border-b border-gray-200">
            <p className="text-xs text-gray-500">Commands {slashMenu.query && <span className="text-brand-600">· "{slashMenu.query}"</span>}</p>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {filteredCmds.map((cmd, i) => (
              <li key={cmd.id}>
                <button onMouseDown={e => { e.preventDefault(); executeSlash(cmd); }}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    i === slashIdx ? 'bg-brand-100 text-brand-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')}>
                  <span className={cn('w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0',
                    i === slashIdx ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500')}>
                    {cmd.icon}
                  </span>
                  <div>
                    <div className="text-xs font-medium">{cmd.label}</div>
                    <div className="text-label text-gray-500 mt-0.5">{cmd.description}</div>
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

function SpaceCard({ space, onSelect, onDeleted, currentUser, onSpaceUpdated }: {
  space: WSpace;
  onSelect: (s: WSpace) => void;
  onDeleted: (id: string) => void;
  currentUser: WUser;
  onSpaceUpdated: (updated: Partial<WSpace>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) { setMenuOpen(false); setMenuPos(null); }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [menuOpen]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setMenuPos({ x: r.right + 4, y: r.top });
    setMenuOpen(v => !v);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false); setMenuPos(null);
    if (!confirm(`Delete space "${space.name}"? This will permanently delete all pages inside it.`)) return;
    setDeleting(true);
    try {
      await wikiSpaces.delete(space.key);
      onDeleted(space.id);
    } finally { setDeleting(false); }
  };

  return (
    <div className="relative group">
      <button
        onClick={() => onSelect(space)}
        disabled={deleting}
        className="w-full text-left p-4 bg-surface-card hover:bg-surface-elevated border border-surface-border hover:border-brand-600/50 rounded-xl transition-all disabled:opacity-40 flex flex-col"
      >
        {/* Icon + name row */}
        <div className="flex items-start gap-3 pr-6">
          <span className="text-2xl flex-shrink-0 leading-none mt-0.5">{space.iconEmoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-white group-hover:text-brand-400 transition-colors leading-snug">{space.name}</span>
              <span className={cn(
                'inline-flex items-center gap-[3px] px-1.5 py-[3px] rounded-full text-label font-bold uppercase tracking-wide flex-shrink-0 border',
                space.isPrivate
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              )}>
                {space.isPrivate ? <Lock size={8} /> : <Globe size={8} />}
                {space.isPrivate ? 'Private' : 'Public'}
              </span>
            </div>
            {space.description && (
              <div className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{space.description}</div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5 my-3" />

        {/* Meta footer */}
        <div className="space-y-1.5">
          {/* Last updated by */}
          {space.creator && (
            <div className="flex items-center gap-1.5">
              <Avatar name={space.creator.name} size="sm" />
              <div className="min-w-0">
                <span className="text-label text-gray-600">Last updated by </span>
                <span className="text-label text-gray-400 font-bold truncate">{space.creator.name}</span>
              </div>
            </div>
          )}

          {/* Updated at */}
          {space.updatedAt && (
            <div className="flex items-center gap-1.5 pl-[26px]">
              <span
                className="text-label text-gray-500"
                title={format(new Date(space.updatedAt), 'EEEE, MMMM d, yyyy · h:mm a')}
              >
                {format(new Date(space.updatedAt), 'MMM d, yyyy · h:mm a')}
              </span>
              <span className="text-label text-gray-700">·</span>
              <span className="text-label text-gray-600">
                <Ago date={space.updatedAt} />
              </span>
            </div>
          )}

          {/* Page count */}
          {space._count != null && (
            <div className="flex items-center gap-1 pl-[26px] mt-0.5">
              <span className="text-label text-gray-600">
                {space._count.pages} page{space._count.pages !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </button>

      {/* Three-dot button — top-right of card, shown on hover */}
      <button
        ref={btnRef}
        onClick={openMenu}
        className={cn(
          'absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md transition-all',
          menuOpen
            ? 'opacity-100 bg-white/10 text-gray-200'
            : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:bg-white/10 hover:text-gray-200',
        )}
        title="Space options"
      >
        <MoreHorizontal size={13} />
      </button>

      {/* Portal menu */}
      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 text-xs"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 pt-1 pb-2 border-b border-white/5 mb-1">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">{space.iconEmoji}</span>
              <span className="text-gray-300 font-medium truncate">{space.name}</span>
            </div>
          </div>

          <button
            onClick={() => { setMenuOpen(false); setMenuPos(null); onSelect(space); }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:bg-white/6 hover:text-white transition-colors"
          >
            <BookOpen size={12} className="text-brand-400 flex-shrink-0" />
            Open space
          </button>

          <button
            onClick={() => { setMenuOpen(false); setMenuPos(null); setShowAccess(true); }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:bg-white/6 hover:text-white transition-colors"
          >
            <UsersIcon size={12} className="text-sky-400 flex-shrink-0" />
            Manage access
          </button>

          <div className="h-px bg-white/5 my-1 mx-2" />

          <button
            onClick={handleDelete}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <Trash2 size={12} className="flex-shrink-0" />
            <div>
              <div>Delete space</div>
              <div className="text-label text-red-600 mt-0.5">Deletes all pages inside</div>
            </div>
          </button>
        </div>,
        document.body
      )}

      <SpaceAccessModal
        open={showAccess}
        onClose={() => setShowAccess(false)}
        space={space}
        currentUser={currentUser}
        onSaved={onSpaceUpdated}
      />
    </div>
  );
}

function SpaceList({ spaces, loading, onSelect, onCreate, onDeleted, onSpaceUpdated, currentUser }: {
  spaces: WSpace[]; loading: boolean;
  onSelect: (s: WSpace) => void;
  onCreate: (s: WSpace) => void;
  onDeleted: (id: string) => void;
  onSpaceUpdated: (id: string, updated: Partial<WSpace>) => void;
  currentUser: WUser;
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
        <div className="text-center py-12 text-gray-500 text-sm">
          <div className="text-4xl mb-3">📄</div>
          No spaces yet. Create your first space above.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map(s => (
            <SpaceCard
              key={s.id}
              space={s}
              onSelect={onSelect}
              onDeleted={onDeleted}
              currentUser={currentUser}
              onSpaceUpdated={updated => onSpaceUpdated(s.id, updated)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add item button (folder or page dropdown) ───────────────────────────────

function AddItemButton({ onAdd, size = 'sm' }: { onAdd: (isFolder: boolean) => void; size?: 'sm' | 'xs' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        title="Add folder or page"
        className={cn(
          'flex items-center justify-center rounded-md transition-colors',
          open ? 'bg-brand-600/40 text-brand-300' : 'bg-brand-600/20 text-brand-300 hover:bg-brand-600/40',
          size === 'sm' ? 'w-6 h-6' : 'w-5 h-5',
        )}>
        <Plus size={size === 'sm' ? 12 : 10} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 text-xs">
          <p className="px-3 pt-1.5 pb-1 text-label text-gray-500">Add to this space</p>
          <button
            onClick={e => { e.stopPropagation(); onAdd(true); setOpen(false); }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 text-gray-200 hover:bg-gray-100 transition-colors">
            <span className="w-6 h-6 flex items-center justify-center rounded bg-amber-100 flex-shrink-0">
              <Folder size={13} className="text-amber-600" />
            </span>
            <div>
              <div className="font-medium">New Folder</div>
              <div className="text-label text-gray-500 mt-0.5">Organize pages into a folder</div>
            </div>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onAdd(false); setOpen(false); }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 text-gray-200 hover:bg-gray-100 transition-colors">
            <span className="w-6 h-6 flex items-center justify-center rounded bg-brand-900/40 flex-shrink-0">
              <FileText size={13} className="text-brand-400" />
            </span>
            <div>
              <div className="font-medium">New Page</div>
              <div className="text-label text-gray-500 mt-0.5">A blank page to write on</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page tree item ───────────────────────────────────────────────────────────

function PageTreeItem({ node, depth, activeId, onSelect, onAdd, drag, onRenamed, onDeleted }: {
  node: WPageNode; depth: number; activeId?: string;
  onSelect: (id: string) => void;
  onAdd: (parentId: string | undefined, isFolder: boolean) => void;
  drag: DragProps;
  onRenamed: (id: string, title: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.title);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const ind = drag.indicator;

  // Close portal menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
        setMenuPos(null);
      }
    };
    // Small delay so the same click that opens doesn't immediately close
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [menuOpen]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!menuOpen) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ x: r.right + 4, y: r.top });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [menuOpen]);

  useEffect(() => { if (renaming) renameRef.current?.focus(); }, [renaming]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // Prefer showing to the right; if too close to right edge fall back to left
    const spaceRight = window.innerWidth - r.right;
    const x = spaceRight >= 180 ? r.right + 4 : r.left - 184;
    const y = r.top;
    setMenuPos({ x, y });
    setMenuOpen(v => !v);
  };

  const commitRename = async () => {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== node.title) {
      await wikiPages.update(node.id, { title: trimmed });
      onRenamed(node.id, trimmed);
    } else {
      setRenameVal(node.title);
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    setMenuPos(null);
    if (!confirm(`Delete "${node.title}" and all its child pages?`)) return;
    await wikiPages.delete(node.id);
    onDeleted(node.id);
  };

  const calcPos = (e: React.DragEvent): 'before' | 'into' | 'after' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = (e.clientY - rect.top) / rect.height;
    return rel < 0.28 ? 'before' : rel > 0.72 ? 'after' : 'into';
  };

  const menu = menuOpen && menuPos && createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 text-xs"
      style={{ left: menuPos.x, top: menuPos.y }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header: what we're acting on */}
      <div className="px-3 pt-1 pb-2 border-b border-white/5 mb-1">
        <div className="flex items-center gap-2">
          {node.isFolder
            ? <Folder size={12} className="text-amber-400 flex-shrink-0" />
            : <FileText size={12} className="text-gray-400 flex-shrink-0" />}
          <span className="text-gray-300 font-medium truncate">{node.title || 'Untitled'}</span>
        </div>
      </div>

      {/* Rename */}
      <button
        onClick={() => { setMenuOpen(false); setMenuPos(null); setRenameVal(node.title); setRenaming(true); }}
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:bg-white/6 hover:text-white transition-colors"
      >
        <Edit2 size={12} className="text-gray-500 flex-shrink-0" />
        <span>Rename</span>
      </button>

      <div className="h-px bg-white/5 my-1 mx-2" />

      {/* Add Folder inside */}
      <button
        onClick={() => { setMenuOpen(false); setMenuPos(null); onAdd(node.id, true); setExpanded(true); }}
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:bg-white/6 hover:text-white transition-colors"
      >
        <Folder size={12} className="text-amber-400 flex-shrink-0" />
        <div>
          <div>New Folder inside</div>
          <div className="text-label text-gray-600 mt-0.5">Add a sub-folder</div>
        </div>
      </button>

      {/* Add Page inside */}
      <button
        onClick={() => { setMenuOpen(false); setMenuPos(null); onAdd(node.id, false); setExpanded(true); }}
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:bg-white/6 hover:text-white transition-colors"
      >
        <FileText size={12} className="text-brand-400 flex-shrink-0" />
        <div>
          <div>New Page inside</div>
          <div className="text-label text-gray-600 mt-0.5">Add a child page</div>
        </div>
      </button>

      <div className="h-px bg-white/5 my-1 mx-2" />

      {/* Delete */}
      <button
        onClick={handleDelete}
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
      >
        <Trash2 size={12} className="flex-shrink-0" />
        <span>Delete</span>
      </button>
    </div>,
    document.body
  );

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
          'group flex items-center gap-1 py-1.5 pr-1 rounded-md cursor-pointer transition-colors text-sm select-none',
          activeId === node.id
            ? 'bg-brand-600/20 text-brand-300'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-100',
          drag.dragIdRef.current === node.id && 'opacity-40',
          ind.overId === node.id && ind.position === 'into' && 'ring-1 ring-brand-500 bg-brand-600/10',
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (renaming) return;
          if (node.isFolder) setExpanded(v => !v);
          else onSelect(node.id);
        }}
      >
        {/* Expand chevron */}
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className={cn(
            'w-4 h-4 flex items-center justify-center flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors rounded',
            !node.children.length && 'invisible',
          )}
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>

        {/* Folder / page icon */}
        <span className="flex-shrink-0 flex items-center justify-center w-4 h-4">
          {node.isFolder
            ? expanded
              ? <FolderOpen size={13} className={cn('transition-colors', activeId === node.id ? 'text-brand-400' : 'text-amber-400/80')} />
              : <Folder size={13} className={cn('transition-colors', activeId === node.id ? 'text-brand-400' : 'text-amber-400/70')} />
            : <FileText size={13} className={cn('transition-colors', activeId === node.id ? 'text-brand-300' : 'text-gray-500')} />}
        </span>

        {/* Title or rename input */}
        {renaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
              if (e.key === 'Escape') { setRenameVal(node.title); setRenaming(false); }
            }}
            className="flex-1 bg-white/10 text-white text-xs px-1.5 py-0.5 rounded outline-none ring-1 ring-brand-500/50 min-w-0"
          />
        ) : (
          <span className="truncate flex-1 text-xs leading-snug">{node.title || 'Untitled'}</span>
        )}

        {/* Three-dot button — always in DOM, visible on hover or when menu open */}
        {!renaming && (
          <button
            ref={btnRef}
            onClick={openMenu}
            className={cn(
              'flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all',
              menuOpen
                ? 'opacity-100 bg-white/10 text-gray-200'
                : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:bg-white/10 hover:text-gray-200',
            )}
            title="More options"
          >
            <MoreHorizontal size={12} />
          </button>
        )}
      </div>

      {ind.overId === node.id && ind.position === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-500 rounded z-10 pointer-events-none" />
      )}

      {expanded && node.children.length > 0 && (
        <ul>
          {node.children.map(child => (
            <PageTreeItem
              key={child.id} node={child} depth={depth + 1} activeId={activeId}
              onSelect={onSelect} onAdd={onAdd} drag={drag}
              onRenamed={onRenamed} onDeleted={onDeleted}
            />
          ))}
        </ul>
      )}

      {menu}
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
  const [showDiff, setShowDiff] = useState(true);

  useEffect(() => { wikiPages.versions(pageId).then(setVersions).finally(() => setLoading(false)); }, [pageId]);

  const loadVersion = async (v: WVersion) => {
    setLoadingDetail(true);
    try { setSelected(await wikiPages.version(pageId, v.version)); }
    finally { setLoadingDetail(false); }
  };

  const isCurrentVersion = selected
    ? selected.content === currentContent && selected.title === currentTitle
    : false;

  return (
    <div className="w-[340px] border-l border-white/8 flex flex-col bg-surface-card flex-shrink-0 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/6 flex-shrink-0 bg-gradient-to-r from-[#13131a] to-[#0e0e12]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600/30 to-brand-600/30 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
            <History size={13} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white leading-tight">Version History</h3>
            {versions.length > 0 && (
              <p className="text-label text-gray-500 leading-tight mt-0.5">
                {versions.length} saved version{versions.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-white/8 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Version timeline ── */}
      <div className="flex-shrink-0 overflow-y-auto border-b border-white/6" style={{ maxHeight: '46%' }}>
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2">
            <Spinner />
            <span className="text-xs text-gray-500">Loading…</span>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-5">
            <div className="w-10 h-10 rounded-xl bg-white/4 border border-white/6 flex items-center justify-center mb-1">
              <History size={18} className="text-gray-600" />
            </div>
            <p className="text-xs font-medium text-gray-400">No versions yet</p>
            <p className="text-label text-gray-600 leading-relaxed">
              Save the page to create snapshots you can restore later.
            </p>
          </div>
        ) : (
          <ul className="py-3 px-3 space-y-1.5">
            {versions.map((v, i) => {
              const isLatest = i === 0;
              const isSelected = selected?.version === v.version;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => loadVersion(v)}
                    className={cn(
                      'w-full text-left rounded-xl px-3.5 py-3 transition-all group relative overflow-hidden',
                      isSelected
                        ? 'bg-gradient-to-br from-brand-600/20 to-violet-600/10 border border-brand-500/30 shadow-sm shadow-brand-500/10'
                        : 'bg-white/[0.025] border border-transparent hover:border-white/8 hover:bg-white/[0.04]',
                    )}
                  >
                    {isSelected && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-brand-500" />
                    )}

                    <div className="flex items-start justify-between gap-2">
                      {/* Version number badge + label */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center font-bold text-label flex-shrink-0',
                          isLatest
                            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                            : isSelected
                            ? 'bg-brand-600/25 border border-brand-500/30 text-brand-400'
                            : 'bg-white/5 border border-white/8 text-gray-500 group-hover:text-gray-300',
                        )}>
                          {v.version}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn(
                              'text-xs font-semibold leading-tight',
                              isSelected ? 'text-white' : 'text-gray-200',
                            )}>
                              Version {v.version}
                            </span>
                            {isLatest && (
                              <span className="inline-flex items-center gap-1 text-label font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 leading-none">
                                <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block" />
                                Latest
                              </span>
                            )}
                          </div>
                          {v.title && (
                            <p className="text-label text-gray-500 truncate mt-0.5 leading-tight">{v.title}</p>
                          )}
                        </div>
                      </div>

                      <Avatar name={v.author.name} size="sm" />
                    </div>

                    <div className="flex items-center gap-3 mt-2 pl-[38px]">
                      <span className="text-label text-gray-500"><Ago date={v.createdAt} /></span>
                      <span className="text-label text-gray-700 truncate">{v.author.name}</span>
                    </div>

                    {v.comment && (
                      <p className="mt-1.5 pl-[38px] text-label text-gray-400 italic line-clamp-2 leading-snug">
                        "{v.comment}"
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Detail / diff panel ── */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {loadingDetail ? (
          <div className="flex items-center justify-center flex-1 gap-2">
            <Spinner />
          </div>
        ) : selected ? (
          <>
            {/* Selected version detail header */}
            <div className="flex-shrink-0 px-4 py-3.5 border-b border-white/6 bg-surface-elevated space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Version label + status badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-2.5">
                    <span className="text-xs font-bold text-white">Version {selected.version}</span>
                    {versions[0]?.version === selected.version && (
                      <span className="text-label font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                        Latest
                      </span>
                    )}
                    {isCurrentVersion && (
                      <span className="text-label font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400">
                        Current
                      </span>
                    )}
                  </div>

                  {/* Saved by row */}
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar name={selected.author.name} size="sm" />
                    <div className="leading-snug">
                      <span className="text-label text-gray-600 uppercase tracking-wider block">Saved by</span>
                      <span className="text-label text-gray-300 font-medium">{selected.author.name}</span>
                    </div>
                  </div>

                  {/* Saved at date-time */}
                  <div className="leading-snug">
                    <span className="text-label text-gray-600 uppercase tracking-wider block">Saved on</span>
                    <span
                      className="text-label text-gray-300 font-medium"
                      title={format(new Date(selected.createdAt), 'EEEE, MMMM d, yyyy · h:mm a')}
                    >
                      {format(new Date(selected.createdAt), 'MMM d, yyyy · h:mm a')}
                    </span>
                    <span className="text-label text-gray-600 ml-1.5">
                      (<Ago date={selected.createdAt} />)
                    </span>
                  </div>

                  {selected.title && (
                    <p className="text-label text-gray-500 truncate mt-1.5 italic">{selected.title}</p>
                  )}
                </div>

                {!isCurrentVersion && (
                  <button
                    onClick={() => onRestore(selected.content, selected.title)}
                    className="flex items-center gap-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 shadow shadow-brand-600/30"
                  >
                    <RotateCcw size={11} />
                    Restore
                  </button>
                )}
              </div>

              {/* Changes / Preview toggle */}
              <div className="flex rounded-lg overflow-hidden border border-white/8 text-label bg-white/3">
                <button
                  onClick={() => setShowDiff(true)}
                  className={cn(
                    'flex-1 py-1.5 font-semibold transition-colors',
                    showDiff ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  Changes
                </button>
                <button
                  onClick={() => setShowDiff(false)}
                  className={cn(
                    'flex-1 py-1.5 font-semibold transition-colors',
                    !showDiff ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  Preview
                </button>
              </div>
            </div>

            {showDiff ? (
              <div className="flex-1 overflow-y-auto">
                <DiffView oldHtml={selected.content} newHtml={currentContent} />
              </div>
            ) : (
              <div
                className="flex-1 overflow-y-auto px-5 py-4 text-xs text-gray-300 wiki-prose leading-relaxed"
                dangerouslySetInnerHTML={{ __html: selected.content }}
              />
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 px-5 text-center py-10">
            <div className="w-10 h-10 rounded-xl bg-white/4 border border-white/6 flex items-center justify-center mb-1">
              <RotateCcw size={16} className="text-gray-600" />
            </div>
            <p className="text-xs font-medium text-gray-400">Select a version</p>
            <p className="text-label text-gray-600 leading-relaxed">
              Pick a version from the timeline above to compare changes or preview content.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Page Access Modal ────────────────────────────────────────────────────────

type VisibilityMode = 'public' | 'private' | 'restricted';
type UserRole = 'none' | 'view' | 'manage';
type SpaceRole = 'none' | 'viewer' | 'admin';

function RolePicker({ role, onChange, disabled }: {
  role: UserRole; onChange: (r: UserRole) => void; disabled?: boolean;
}) {
  const opts: { value: UserRole; label: string }[] = [
    { value: 'none',   label: 'No access'      },
    { value: 'view',   label: 'View only'       },
    { value: 'manage', label: 'View & Manage'   },
  ];
  return (
    <div className={cn('flex rounded-lg overflow-hidden border border-white/10 text-label font-semibold', disabled && 'opacity-40 pointer-events-none')}>
      {opts.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 py-1.5 transition-colors leading-none whitespace-nowrap',
            role === o.value
              ? o.value === 'none'
                ? 'bg-gray-200 text-gray-700'
                : o.value === 'view'
                ? 'bg-sky-600 text-white'
                : 'bg-brand-600 text-white'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PageAccessModal({ open, onClose, page, currentUser, onSaved }: {
  open: boolean; onClose: () => void;
  page: WPage; currentUser: WUser;
  onSaved: (updated: Partial<WPage>) => void;
}) {
  const [mode, setMode]               = useState<VisibilityMode>(!page.isPrivate ? 'public' : 'private');
  const [allUsers, setAllUsers]       = useState<WUser[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);

  const isAuthor = currentUser.id === page.creator.id;

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    Promise.all([wikiUsers.list(), wikiPages.getAccess(page.id)])
      .then(([users, accessList]) => {
        setAllUsers(users);

        // Build initial pending roles from what's already granted
        const initial: Record<string, UserRole> = {};
        for (const u of users) initial[u.id] = 'none';
        for (const a of accessList) initial[a.user.id] = a.role as UserRole;
        setPendingRoles(initial);

        // Auto-select "restricted" if there are any grants and page is private
        const initialMode = !page.isPrivate ? 'public' : accessList.length > 0 ? 'restricted' : 'private';
        setMode(initialMode);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, page.id, page.isPrivate]);

  const setRole = (userId: string, role: UserRole) => {
    if (!isAuthor) return;
    setPendingRoles(prev => ({ ...prev, [userId]: role }));
    // Auto-switch to restricted when any user is given access
    if (role !== 'none' && mode !== 'restricted') setMode('restricted');
  };

  const save = async () => {
    setSaving(true);
    try {
      const isPrivate = mode !== 'public';

      // Visibility change
      await wikiPages.update(page.id, { isPrivate });

      // Sync roles: get current access list fresh to diff against
      const currentAccess = await wikiPages.getAccess(page.id);
      const currentRoles: Record<string, UserRole> = {};
      for (const a of currentAccess) currentRoles[a.user.id] = a.role as UserRole;

      await Promise.all(
        Object.entries(pendingRoles).map(async ([userId, role]) => {
          const was = currentRoles[userId] ?? 'none';
          if (was === role) return;
          if (role === 'none') {
            await wikiPages.revokeAccess(page.id, userId);
          } else if (was === 'none') {
            await wikiPages.grantAccess(page.id, userId, role);
          } else {
            await wikiPages.updateAccessRole(page.id, userId, role);
          }
        })
      );

      onSaved({ isPrivate });
      onClose();
    } finally { setSaving(false); }
  };

  if (!open) return null;

  const VISIBILITY_OPTS: { id: VisibilityMode; icon: React.ReactNode; label: string; desc: string; color: string }[] = [
    {
      id: 'public', icon: <Globe size={15} />, label: 'Public',
      desc: 'Everyone can view and edit this page',
      color: 'border-emerald-500/50 bg-emerald-500/8',
    },
    {
      id: 'private', icon: <Lock size={15} />, label: 'Private',
      desc: 'Only you (the author) can view or edit',
      color: 'border-amber-500/50 bg-amber-500/8',
    },
    {
      id: 'restricted', icon: <UsersIcon size={15} />, label: 'Restricted',
      desc: 'Choose who can view or manage this page',
      color: 'border-brand-500/50 bg-brand-500/8',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-surface-card border border-white/10 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-lg flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 bg-gradient-to-r from-[#13131a] to-[#0e0e12] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-600/25 border border-brand-500/25 flex items-center justify-center flex-shrink-0">
              <Lock size={13} className="text-brand-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Page Access</h3>
              <p className="text-label text-gray-500 leading-tight mt-0.5 truncate max-w-[260px]">{page.title || 'Untitled'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-5 space-y-5">

            {/* Non-author notice */}
            {!isAuthor && (
              <div className="flex items-start gap-2.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-3">
                <Lock size={13} className="flex-shrink-0 mt-0.5" />
                <span>Only the page author can change access settings. You are viewing in read-only mode.</span>
              </div>
            )}

            {/* ── Visibility ── */}
            <div>
              <p className="text-label font-bold text-gray-500 uppercase tracking-widest mb-2.5">Visibility</p>
              <div className="grid grid-cols-3 gap-2">
                {VISIBILITY_OPTS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => isAuthor && setMode(opt.id)}
                    disabled={!isAuthor}
                    className={cn(
                      'flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-all',
                      mode === opt.id ? opt.color : 'border-white/6 bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/12',
                      !isAuthor && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span className={cn('transition-colors', mode === opt.id ? 'text-white' : 'text-gray-500')}>{opt.icon}</span>
                    <span className={cn('text-xs font-semibold leading-tight', mode === opt.id ? 'text-white' : 'text-gray-300')}>{opt.label}</span>
                    <span className="text-label text-gray-500 leading-snug">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── People ── */}
            <div>
              <p className="text-label font-bold text-gray-500 uppercase tracking-widest mb-2.5">People</p>

              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2"><Spinner /><span className="text-xs text-gray-500">Loading users…</span></div>
              ) : (
                <div className="space-y-1">

                  {/* Author row — always first */}
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/6">
                    <Avatar name={page.creator.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">{page.creator.name}</span>
                        {page.creator.id === currentUser.id && (
                          <span className="text-label text-gray-500">(you)</span>
                        )}
                      </div>
                      <p className="text-label text-gray-600 truncate mt-0.5">Page author</p>
                    </div>
                    <span className="text-label font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-400 flex-shrink-0">
                      Owner
                    </span>
                  </div>

                  {/* All other registered users */}
                  {allUsers.filter(u => u.id !== page.creator.id).length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-4 italic">No other registered users yet.</p>
                  ) : (
                    allUsers
                      .filter(u => u.id !== page.creator.id)
                      .map(u => {
                        const role = pendingRoles[u.id] ?? 'none';
                        return (
                          <div key={u.id} className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                            role !== 'none'
                              ? 'bg-white/[0.035] border-white/8'
                              : 'bg-transparent border-transparent hover:bg-white/[0.025] hover:border-white/5',
                          )}>
                            <Avatar name={u.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{u.name}</p>
                              <p className="text-label text-gray-600 truncate">{u.email}</p>
                            </div>
                            <RolePicker role={role} onChange={r => setRole(u.id, r)} disabled={!isAuthor} />
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>

            {/* Role legend */}
            {mode === 'restricted' && (
              <div className="rounded-xl bg-white/[0.025] border border-white/6 p-3 space-y-1.5">
                <p className="text-label font-bold text-gray-500 uppercase tracking-widest mb-1">Role guide</p>
                <div className="flex items-start gap-2">
                  <span className="text-label font-semibold text-sky-400 w-20 flex-shrink-0 mt-px">View only</span>
                  <span className="text-label text-gray-500 leading-snug">Can read the page and leave comments. Cannot edit or delete.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-label font-semibold text-brand-400 w-20 flex-shrink-0 mt-px">View & Manage</span>
                  <span className="text-label text-gray-500 leading-snug">Can read, edit, delete, and rearrange the page structure.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-white/6 bg-surface-elevated">
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/8 transition-colors">
            Cancel
          </button>
          {isAuthor && (
            <button
              onClick={save}
              disabled={saving}
              className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow shadow-brand-600/30"
            >
              {saving ? <><Spinner /><span>Saving…</span></> : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Space Role Picker + Space Access Modal ───────────────────────────────────

function SpaceRolePicker({ role, onChange, disabled }: {
  role: SpaceRole; onChange: (r: SpaceRole) => void; disabled?: boolean;
}) {
  const opts: { value: SpaceRole; label: string }[] = [
    { value: 'none',   label: 'No access' },
    { value: 'viewer', label: 'Viewer'    },
    { value: 'admin',  label: 'Admin'     },
  ];
  return (
    <div className={cn('flex rounded-lg overflow-hidden border border-white/10 text-label font-semibold', disabled && 'opacity-40 pointer-events-none')}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn('px-2.5 py-1.5 transition-colors leading-none whitespace-nowrap',
            role === o.value
              ? o.value === 'none'   ? 'bg-gray-200 text-gray-700'
              : o.value === 'viewer' ? 'bg-sky-600 text-white'
              :                       'bg-brand-600 text-white'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SpaceAccessModal({ open, onClose, space, currentUser, onSaved }: {
  open: boolean; onClose: () => void;
  space: WSpace; currentUser: WUser;
  onSaved: (updated: Partial<WSpace>) => void;
}) {
  const [isPrivate, setIsPrivate]       = useState(space.isPrivate);
  const [allUsers, setAllUsers]         = useState<WUser[]>([]);
  const [members, setMembers]           = useState<WSpaceMember[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, SpaceRole>>({});
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);

  const isAdmin = members.find(m => m.user.id === currentUser.id)?.role === 'admin'
    || space.creator?.id === currentUser.id;

  useEffect(() => {
    if (!open) return;
    setIsPrivate(space.isPrivate);
    setLoading(true);
    Promise.all([wikiUsers.list(), wikiSpaces.getMembers(space.key)])
      .then(([users, mems]) => {
        setAllUsers(users);
        setMembers(mems);
        const initial: Record<string, SpaceRole> = {};
        for (const u of users) initial[u.id] = 'none';
        for (const m of mems) initial[m.user.id] = m.role as SpaceRole;
        setPendingRoles(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, space.key, space.isPrivate]);

  const setRole = (userId: string, role: SpaceRole) => {
    if (!isAdmin) return;
    setPendingRoles(prev => ({ ...prev, [userId]: role }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await wikiSpaces.update(space.key, { isPrivate });
      const currentRoles: Record<string, SpaceRole> = {};
      for (const m of members) currentRoles[m.user.id] = m.role as SpaceRole;

      await Promise.all(
        Object.entries(pendingRoles).map(async ([userId, role]) => {
          const was = currentRoles[userId] ?? 'none';
          if (was === role) return;
          if (role === 'none') await wikiSpaces.removeMember(space.key, userId);
          else await wikiSpaces.setMember(space.key, userId, role);
        })
      );

      onSaved({ isPrivate });
      onClose();
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-surface-card border border-white/10 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-lg flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 bg-gradient-to-r from-[#13131a] to-[#0e0e12] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-600/25 border border-brand-500/25 flex items-center justify-center flex-shrink-0">
              <UsersIcon size={13} className="text-brand-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Space Access</h3>
              <p className="text-label text-gray-500 leading-tight mt-0.5 truncate max-w-[260px]">{space.iconEmoji} {space.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-5 space-y-5">

            {!isAdmin && (
              <div className="flex items-start gap-2.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-3">
                <Lock size={13} className="flex-shrink-0 mt-0.5" />
                <span>Only space admins can change access settings. You are viewing in read-only mode.</span>
              </div>
            )}

            {/* Visibility */}
            <div>
              <p className="text-label font-bold text-gray-500 uppercase tracking-widest mb-2.5">Visibility</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { priv: false, icon: <Globe size={15} />, label: 'Public', desc: 'Everyone can view this space and its pages', color: 'border-emerald-500/50 bg-emerald-500/8' },
                  { priv: true,  icon: <Lock size={15} />,  label: 'Private', desc: 'Only members can view this space', color: 'border-amber-500/50 bg-amber-500/8' },
                ].map(opt => (
                  <button key={String(opt.priv)}
                    onClick={() => isAdmin && setIsPrivate(opt.priv)}
                    disabled={!isAdmin}
                    className={cn(
                      'flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-all',
                      isPrivate === opt.priv ? opt.color : 'border-white/6 bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/12',
                      !isAdmin && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span className={isPrivate === opt.priv ? 'text-white' : 'text-gray-500'}>{opt.icon}</span>
                    <span className={cn('text-xs font-semibold', isPrivate === opt.priv ? 'text-white' : 'text-gray-300')}>{opt.label}</span>
                    <span className="text-label text-gray-500 leading-snug">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Members */}
            <div>
              <p className="text-label font-bold text-gray-500 uppercase tracking-widest mb-2.5">Members</p>
              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2"><Spinner /><span className="text-xs text-gray-500">Loading users…</span></div>
              ) : (
                <div className="space-y-1">
                  {space.creator && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/6">
                      <Avatar name={space.creator.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white truncate">{space.creator.name}</span>
                          {space.creator.id === currentUser.id && <span className="text-label text-gray-500">(you)</span>}
                        </div>
                        <p className="text-label text-gray-600 mt-0.5">Space owner</p>
                      </div>
                      <span className="text-label font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-400 flex-shrink-0">Owner</span>
                    </div>
                  )}

                  {allUsers.filter(u => u.id !== space.creator?.id).length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-4 italic">No other registered users yet.</p>
                  ) : allUsers.filter(u => u.id !== space.creator?.id).map(u => {
                    const role = pendingRoles[u.id] ?? 'none';
                    return (
                      <div key={u.id} className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                        role !== 'none' ? 'bg-white/[0.035] border-white/8' : 'bg-transparent border-transparent hover:bg-white/[0.025] hover:border-white/5',
                      )}>
                        <Avatar name={u.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{u.name}</p>
                          <p className="text-label text-gray-600 truncate">{u.email}</p>
                        </div>
                        <SpaceRolePicker role={role} onChange={r => setRole(u.id, r)} disabled={!isAdmin} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Role legend */}
            <div className="rounded-xl bg-white/[0.025] border border-white/6 p-3 space-y-1.5">
              <p className="text-label font-bold text-gray-500 uppercase tracking-widest mb-1">Role guide</p>
              <div className="flex items-start gap-2">
                <span className="text-label font-semibold text-sky-400 w-14 flex-shrink-0 mt-px">Viewer</span>
                <span className="text-label text-gray-500 leading-snug">Can view all pages in this space. Cannot create or edit pages.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-label font-semibold text-brand-400 w-14 flex-shrink-0 mt-px">Admin</span>
                <span className="text-label text-gray-500 leading-snug">Can view, create, edit, and delete pages. Can manage space members.</span>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-white/6 bg-surface-elevated">
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/8 transition-colors">Cancel</button>
          {isAdmin && (
            <button onClick={save} disabled={saving}
              className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow shadow-brand-600/30">
              {saving ? <><Spinner /><span>Saving…</span></> : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [pageState, setPageState] = useState(page);
  const [canManage, setCanManage] = useState(!page.isPrivate || currentUser.id === page.creator.id);
  const [comments, setComments] = useState<WComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const contentRef = useRef(page.content || '');
  const titleRef = useRef(page.title);
  const editorRef = useRef<Editor | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Resolve manage permission for private/restricted pages
  useEffect(() => {
    if (!page.isPrivate || currentUser.id === page.creator.id) { setCanManage(true); return; }
    wikiPages.getAccess(page.id).then(list => {
      const entry = list.find(a => a.user.id === currentUser.id);
      setCanManage(entry?.role === 'manage');
    }).catch(() => setCanManage(false));
  }, [page.id, page.isPrivate, page.creator.id, currentUser.id]);

  useEffect(() => {
    if (showComments) wikiComments.list(page.id).then(setComments).catch(() => {});
  }, [showComments, page.id]);

  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExport]);

  // ⌘S / Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true); setSaveError(false);
    try {
      const updated = await wikiPages.update(page.id, { title: titleRef.current, content: contentRef.current });
      onSaved(updated);
      setIsDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch { setSaveError(true); }
    finally { setSaving(false); }
  }, [saving, page.id, onSaved]);

  const handleContentUpdate = (html: string) => {
    contentRef.current = html;
    setIsDirty(true);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    setTitle(t); titleRef.current = t;
    setIsDirty(true);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${title}"?`)) return;
    await wikiPages.delete(page.id);
    onDeleted();
  };

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const exportPDF = () => {
    setShowExport(false);
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
    setShowExport(false);
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>${escHtml(title)}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>body{font-family:Calibri,sans-serif;font-size:12pt;line-height:1.5;color:#000}h1{font-size:24pt;font-weight:bold;margin-bottom:6pt}h2{font-size:18pt;font-weight:bold;margin-bottom:4pt}h3{font-size:14pt;font-weight:bold;margin-bottom:3pt}p{margin-bottom:8pt}ul,ol{padding-left:24pt}li{margin-bottom:3pt}blockquote{margin-left:20pt;color:#6b7280;font-style:italic}pre,code{font-family:Consolas,monospace;font-size:10pt;background:#f3f4f6}pre{padding:8pt;margin:8pt 0}table{border-collapse:collapse;width:100%}th,td{border:1pt solid #d1d5db;padding:6pt}th{background:#f9fafb;font-weight:bold}hr{border-top:1pt solid #e5e7eb}</style></head><body><h1>${escHtml(title)}</h1>${contentRef.current}</body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^\w\s-]/g, '').trim() || 'untitled'}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (content: string, restoredTitle: string) => {
    editorRef.current?.commands.setContent(content);
    contentRef.current = content;
    setTitle(restoredTitle); titleRef.current = restoredTitle;
    setShowHistory(false);
    await handleSave();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    const c = await wikiComments.create(page.id, commentBody.trim(), replyTo ?? undefined);
    setComments(prev => replyTo ? prev.map(x => x.id === replyTo ? { ...x, replies: [...(x.replies ?? []), c] } : x) : [...prev, c]);
    setCommentBody(''); setReplyTo(null);
  };

  const visibilityIcon = pageState.isPrivate ? <Lock size={12} /> : <Globe size={12} />;
  const visibilityLabel = pageState.isPrivate ? 'Private' : 'Public';

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-surface-border bg-surface-card flex-shrink-0 gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft size={13} />Back
          </button>
          <div className="flex items-center gap-1 flex-wrap justify-end">

            {/* Dirty / save status indicator */}
            {saveError && (
              <span className="text-xs text-red-400 flex items-center gap-1 mr-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Save failed
              </span>
            )}
            {savedFlash && !isDirty && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 mr-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Saved
              </span>
            )}
            {isDirty && !saving && (
              <span className="text-xs text-amber-400 flex items-center gap-1 mr-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Unsaved changes
              </span>
            )}

            {/* Save button — only shown when user can manage */}
            {canManage && (
              <button
                onClick={() => void handleSave()}
                disabled={saving || (!isDirty && !saveError)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all',
                  isDirty || saveError
                    ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-600/30'
                    : 'bg-surface-elevated text-gray-500 cursor-not-allowed',
                )}
                title="Save (⌘S)"
              >
                {saving ? <><Spinner /><span>Saving…</span></> : <><span>Save</span><kbd className="opacity-50 font-mono text-label">⌘S</kbd></>}
              </button>
            )}
            {!canManage && (
              <span className="text-label text-gray-600 flex items-center gap-1 px-2">
                <Lock size={10} />View only
              </span>
            )}

            <div className="w-px h-4 bg-surface-border mx-0.5" />

            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button onClick={() => setShowExport(v => !v)}
                className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors',
                  showExport ? 'bg-surface-elevated text-white' : 'text-gray-400 hover:text-white hover:bg-surface-elevated')}>
                <FileDown size={12} />Export<ChevronDown size={10} className={cn('transition-transform', showExport && 'rotate-180')} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 text-xs">
                  <button onClick={exportPDF}
                    className="w-full flex items-center gap-2 px-3 py-2 text-gray-200 hover:bg-gray-100 transition-colors">
                    <FileDown size={12} />PDF
                  </button>
                  <button onClick={exportWord}
                    className="w-full flex items-center gap-2 px-3 py-2 text-gray-200 hover:bg-gray-100 transition-colors">
                    <FileDown size={12} />Word (.doc)
                  </button>
                </div>
              )}
            </div>

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

            {/* Access / visibility button */}
            <button onClick={() => setShowAccessModal(true)}
              title={pageState.isPrivate ? 'Private — manage access' : 'Public — manage access'}
              className={cn('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors',
                pageState.isPrivate ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-500 hover:text-gray-900 hover:bg-surface-elevated')}>
              {visibilityIcon}{visibilityLabel}
            </button>

            <button onClick={onToggleFullWidth} title={fullWidth ? 'Narrow width' : 'Full width'}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-elevated transition-colors">
              {fullWidth ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            {canManage && (
              <button onClick={handleDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-surface-elevated transition-colors flex-shrink-0" title="Delete page">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Page header + content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className={cn(fullWidth ? 'max-w-none px-8' : 'max-w-3xl px-8', 'mx-auto w-full pt-8 flex-shrink-0')}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{page.emoji}</span>
              <input
                value={title}
                onChange={handleTitleChange}
                placeholder="Untitled"
                readOnly={!canManage}
                className={cn(
                  'flex-1 text-2xl font-bold bg-transparent border-none outline-none text-white placeholder:text-gray-600',
                  !canManage && 'cursor-default select-text',
                )}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500 mb-3">
              {/* Created by */}
              <div className="flex items-center gap-2">
                <Avatar name={page.creator.name} size="sm" />
                <div className="leading-snug">
                  <span className="text-label text-gray-600 uppercase tracking-wider block">Created by</span>
                  <span className="text-gray-300 font-medium">{page.creator.name}</span>
                </div>
              </div>

              <div className="w-px h-6 bg-white/8 hidden sm:block" />

              {/* Last updated */}
              <div className="leading-snug">
                <span className="text-label text-gray-600 uppercase tracking-wider block">Last updated</span>
                <span
                  className="text-gray-300 font-medium"
                  title={format(new Date(pageState.updatedAt), 'EEEE, MMMM d, yyyy · h:mm a')}
                >
                  {format(new Date(pageState.updatedAt), 'MMM d, yyyy · h:mm a')}
                </span>
                <span className="text-gray-600 ml-1.5">
                  (<Ago date={pageState.updatedAt} />)
                </span>
              </div>
            </div>
            {/* Expand / collapse — thin rule with centred arrow */}
            <div className="flex items-center gap-3 mb-6 group">
              <div className="flex-1 h-px bg-surface-border group-hover:bg-gray-600 transition-colors" />
              <button
                onClick={onToggleFullWidth}
                title={fullWidth ? 'Collapse to reading width' : 'Expand to full width'}
                className="text-gray-600 hover:text-gray-300 transition-colors p-0.5"
              >
                <ChevronsLeftRight size={14} />
              </button>
              <div className="flex-1 h-px bg-surface-border group-hover:bg-gray-600 transition-colors" />
            </div>
          </div>

          <RichEditor
            content={page.content || ''}
            onUpdate={handleContentUpdate}
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

      {/* Page Access Modal */}
      <PageAccessModal
        open={showAccessModal}
        onClose={() => setShowAccessModal(false)}
        page={pageState}
        currentUser={currentUser}
        onSaved={updated => setPageState(p => ({ ...p, ...updated }))}
      />
    </div>
  );
}

// ─── Attachments panel ────────────────────────────────────────────────────────

function AttachmentsPanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [attachments, setAttachments] = useState<WAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { wikiAttachments.list(pageId).then(setAttachments).finally(() => setLoading(false)); }, [pageId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const att = await wikiAttachments.upload(pageId, file); setAttachments(prev => [att, ...prev]); }
    catch { /* upload failed */ }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove attachment?')) return;
    await wikiAttachments.delete(id);
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const fmt = (b: number) => b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`;
  const fileEmoji = (mime: string) => {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel')) return '📊';
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
        <label className={cn('flex items-center justify-center gap-2 w-full text-xs px-3 py-2.5 rounded-lg border border-dashed transition-colors cursor-pointer',
          uploading ? 'border-brand-600/50 text-brand-400 bg-brand-600/5' : 'border-surface-border text-gray-400 hover:border-brand-600/50 hover:text-brand-400 hover:bg-brand-600/5')}>
          {uploading ? <Spinner /> : <FileUp size={13} />}
          {uploading ? 'Uploading…' : 'Upload a file'}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        {loading ? <div className="flex justify-center py-4"><Spinner /></div>
          : attachments.length === 0 ? <p className="text-xs text-gray-500 text-center py-4">No attachments yet</p>
            : <ul className="space-y-1.5">
                {attachments.map(a => (
                  <li key={a.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-elevated group">
                    <span className="text-base flex-shrink-0">{fileEmoji(a.mimeType)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate" title={a.filename}>{a.filename}</p>
                      <p className="text-xs text-gray-500">{fmt(a.size)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <a href={`/wiki-api/uploads/${a.storedName}`} download={a.filename}
                        className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-surface-border transition-colors" title="Download">
                        <FileDown size={12} />
                      </a>
                      <button onClick={() => handleDelete(a.id)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-surface-border transition-colors" title="Remove">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>}
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
  const [fullWidth, setFullWidth] = useState<boolean>(() => {
    try { const v = localStorage.getItem('wiki-full-width'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const dragIdRef = useRef<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DragIndicator>({ overId: null, position: 'before' });

  const refreshTree = useCallback(() => { wikiPages.tree(space.key).then(setTree); }, [space.key]);

  useEffect(() => { wikiPages.tree(space.key).then(setTree).finally(() => setTreeLoading(false)); }, [space.key]);

  const loadPage = async (id: string) => {
    setPageLoading(true); setActivePage(null);
    try { setActivePage(await wikiPages.get(id)); } finally { setPageLoading(false); }
  };

  const addItem = async (parentId: string | undefined, isFolder: boolean) => {
    const p = await wikiPages.create(space.key, { parentId, isFolder });
    const nn: WPageNode = { id: p.id, title: p.title, emoji: p.emoji, parentId: parentId ?? null, position: 0, isFolder, children: [] };
    if (parentId) {
      setTree(prev => {
        const ins = (ns: WPageNode[]): WPageNode[] =>
          ns.map(n => n.id === parentId ? { ...n, children: [...n.children, nn] } : { ...n, children: ins(n.children) });
        return ins(prev);
      });
    } else {
      setTree(prev => [...prev, nn]);
    }
    if (!isFolder) loadPage(p.id);
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

  const handleRenamed = (id: string, newTitle: string) => {
    const update = (nodes: WPageNode[]): WPageNode[] =>
      nodes.map(n => n.id === id ? { ...n, title: newTitle } : { ...n, children: update(n.children) });
    setTree(prev => update(prev));
    if (activePage?.id === id) setActivePage(p => p ? { ...p, title: newTitle } : null);
  };

  const handleDeleted = (id: string) => {
    const [updated] = removeNode(tree, id);
    setTree(updated);
    if (activePage?.id === id) { setActivePage(null); }
  };

  const dragProps: DragProps = { dragIdRef, indicator: dropIndicator, setIndicator: setDropIndicator, onMove: handleMove };

  const flatSearch = (nodes: WPageNode[], q: string): WPageNode[] =>
    nodes.flatMap(n => [...(n.title.toLowerCase().includes(q.toLowerCase()) ? [n] : []), ...flatSearch(n.children, q)]);
  const filtered = search ? flatSearch(tree, search) : null;

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startW.current = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const next = Math.min(400, Math.max(160, startW.current + ev.clientX - startX.current));
      setSidebarWidth(next);
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn('flex-shrink-0 border-r border-surface-border flex flex-col bg-surface-card overflow-hidden transition-[opacity,visibility]',
          fullWidth && activePage ? 'opacity-0 pointer-events-none w-0' : 'opacity-100')}
        style={{ width: (fullWidth && activePage) ? 0 : sidebarWidth }}>

        {/* Space header */}
        <div className="px-3 py-3 border-b border-surface-border flex-shrink-0">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-2.5 transition-colors group">
            <ArrowLeft size={11} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>All spaces</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{space.iconEmoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-white truncate">{space.name}</p>
              {space._count !== undefined && (
                <p className="text-label text-gray-500 mt-0.5">{space._count.pages} page{space._count.pages !== 1 ? 's' : ''}</p>
              )}
            </div>
            <AddItemButton onAdd={(isFolder) => addItem(undefined, isFolder)} />
          </div>
        </div>

        {/* Search */}
        <div className="px-2.5 py-2 border-b border-surface-border flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-surface-elevated rounded-lg px-2.5 py-1.5 ring-1 ring-transparent focus-within:ring-brand-500/30 transition-all">
            <Search size={11} className="text-gray-500 flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pages…"
              className="flex-1 bg-transparent text-xs text-white placeholder:text-gray-600 outline-none" />
          </div>
        </div>

        {/* Page tree */}
        <div className="flex-1 overflow-y-auto py-1.5 px-1"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            const id = e.dataTransfer.getData('pageId');
            if (id) { const d = findNode(tree, id); if (d && d.parentId !== null) void handleMove(id, tree[tree.length - 1]?.id ?? id, 'after'); }
            setDropIndicator({ overId: null, position: 'before' });
          }}>
          {treeLoading ? <div className="flex justify-center pt-8"><Spinner /></div>
            : filtered !== null ? (
              filtered.length === 0
                ? <p className="text-xs text-gray-600 text-center pt-6">No pages match</p>
                : <ul className="space-y-0.5">
                    {filtered.map(n => (
                      <li key={n.id}>
                        <button onClick={() => loadPage(n.id)}
                          className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-surface-elevated hover:text-white rounded-md transition-colors">
                          <FileText size={12} className="text-gray-500 flex-shrink-0" />
                          <span className="truncate">{n.title || 'Untitled'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
            ) : tree.length === 0 ? (
              <div className="text-center pt-10 px-4">
                <Folder size={24} className="text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500 mb-2">No pages yet</p>
                <button onClick={() => addItem(undefined, false)} className="text-xs text-brand-400 hover:underline">Create first page</button>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {tree.map(n => (
                  <PageTreeItem key={n.id} node={n} depth={0} activeId={activePage?.id}
                    onSelect={loadPage} onAdd={addItem} drag={dragProps}
                    onRenamed={handleRenamed} onDeleted={handleDeleted} />
                ))}
              </ul>
            )}
        </div>
      </div>

      {/* Resize handle */}
      {!(fullWidth && activePage) && (
        <div
          onMouseDown={onResizerMouseDown}
          className="w-1 flex-shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-brand-500/30 transition-colors relative"
          title="Drag to resize sidebar">
          <GripVertical size={12} className="text-gray-700 group-hover:text-brand-400 transition-colors absolute" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden min-w-0">
        {pageLoading ? <div className="flex items-center justify-center h-full"><Spinner /></div>
          : activePage ? (
            <PageEditorView
              page={activePage}
              currentUser={currentUser}
              fullWidth={fullWidth}
              onToggleFullWidth={() => setFullWidth(v => {
                const next = !v;
                try { localStorage.setItem('wiki-full-width', String(next)); } catch {}
                return next;
              })}
              onBack={() => setActivePage(null)}
              onSaved={p => {
                setActivePage(p);
                setTree(prev => { const up = (ns: WPageNode[]): WPageNode[] => ns.map(n => n.id === p.id ? { ...n, title: p.title, emoji: p.emoji } : { ...n, children: up(n.children) }); return up(prev); });
              }}
              onDeleted={() => { setActivePage(null); setFullWidth(false); refreshTree(); }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-3">{space.iconEmoji}</div>
              <h2 className="text-base font-semibold text-white mb-1">{space.name}</h2>
              {space.description && <p className="text-sm text-gray-500 mb-4 max-w-xs">{space.description}</p>}
              <div className="flex items-center gap-2">
                <button onClick={() => addItem(undefined, true)} className="flex items-center gap-1.5 text-sm bg-surface-elevated hover:bg-gray-100 text-gray-600 px-3 py-2 rounded-lg transition-colors border border-surface-border"><Folder size={14} className="text-amber-500" />New Folder</button>
                <button onClick={() => addItem(undefined, false)} className="flex items-center gap-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg transition-colors"><Plus size={14} />New Page</button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

// ─── Root WikiModule ──────────────────────────────────────────────────────────

const WIKI_EMAIL = 'wiki@prm.internal';
const WIKI_PASS  = 'wiki-prm-default';

type View = 'loading' | 'spaces' | 'space';

export function WikiModule() {
  const { user: prmUser } = useAuthStore();
  const [view, setView] = useState<View>('loading');
  const [user, setUser] = useState<WUser | null>(null);
  const [spaces, setSpaces] = useState<WSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [activeSpace, setActiveSpace] = useState<WSpace | null>(null);
  const [authError, setAuthError] = useState('');

  // The real display name comes from the PRM login (e.g. "Ganesh Bandi")
  const realName = prmUser?.name ?? 'Wiki User';

  const loadSpaces = useCallback(() => {
    setSpacesLoading(true);
    wikiSpaces.list().then(setSpaces).finally(() => setSpacesLoading(false));
  }, []);

  const syncName = async (u: WUser): Promise<WUser> => {
    if (u.name === realName) return u;
    try { return await wikiAuth.updateProfile({ name: realName }); }
    catch { return u; } // name sync is best-effort; never block login
  };

  const autoAuth = useCallback(async () => {
    // 1. Reuse stored token
    const stored = getWikiAuth();
    if (stored?.accessToken) {
      try {
        const u = await wikiAuth.me();
        const synced = await syncName(u);
        setUser(synced); loadSpaces(); setView('spaces'); return;
      } catch { clearWikiAuth(); }
    }
    // 2. Login (account already registered)
    try {
      const r = await wikiAuth.login(WIKI_EMAIL, WIKI_PASS);
      setWikiAuth(r.tokens, r.user);
      const synced = await syncName(r.user);
      setUser(synced); loadSpaces(); setView('spaces'); return;
    } catch (loginErr: unknown) {
      // If login failed for a reason other than "wrong credentials / not found",
      // surface the error rather than blindly falling through to register.
      const status = (loginErr as { response?: { status?: number } })?.response?.status;
      if (status !== 401 && status !== 404) {
        setAuthError('Wiki server unavailable. Make sure it is running.');
        return;
      }
    }
    // 3. First run — register with the real name
    try {
      const r = await wikiAuth.register(WIKI_EMAIL, realName, WIKI_PASS);
      setWikiAuth(r.tokens, r.user); setUser(r.user); loadSpaces(); setView('spaces');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setAuthError(msg ?? 'Wiki server unavailable. Make sure it is running.');
    }
  }, [loadSpaces, realName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void autoAuth(); }, [autoAuth]);

  return (
    <div className="flex flex-col h-full">
      {view === 'space' && activeSpace && (
        <div className="flex items-center px-4 py-2 border-b border-surface-border bg-surface-card flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <ChevronRight size={12} className="text-gray-600" />
            <span>{activeSpace.iconEmoji}</span>
            <span className="text-gray-300 font-medium">{activeSpace.name}</span>
          </div>
        </div>
      )}
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
              onDeleted={id => setSpaces(prev => prev.filter(s => s.id !== id))}
              onSpaceUpdated={(id, updated) => setSpaces(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))}
              currentUser={user!}
            />
          </div>
        )}
        {view === 'space' && activeSpace && user && (
          <SpaceView space={activeSpace} currentUser={user} onBack={() => { setView('spaces'); setActiveSpace(null); }} />
        )}
      </div>

      <style>{`
        .wiki-prose { flex: 1; }
        .wiki-prose .ProseMirror { outline: none; color: #1e293b; line-height: 1.75; min-height: 400px; font-size: 0.9375rem; }
        .wiki-prose .ProseMirror > * + * { margin-top: 0.5rem; }
        .wiki-prose .ProseMirror h1 { font-size: 1.75rem; font-weight: 700; color: #0f172a; margin-top: 1.75rem; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
        .wiki-prose .ProseMirror h2 { font-size: 1.35rem; font-weight: 600; color: #1e293b; margin-top: 1.5rem; margin-bottom: 0.4rem; }
        .wiki-prose .ProseMirror h3 { font-size: 1.1rem; font-weight: 600; color: #1e293b; margin-top: 1.25rem; margin-bottom: 0.3rem; }
        .wiki-prose .ProseMirror p { color: #374151; }
        .wiki-prose .ProseMirror p.is-empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; float: left; height: 0; }
        .wiki-prose .ProseMirror ul { list-style: disc; padding-left: 1.5rem; }
        .wiki-prose .ProseMirror ol { list-style: decimal; padding-left: 1.5rem; }
        .wiki-prose .ProseMirror li { color: #374151; margin-bottom: 0.15rem; }
        .wiki-prose .ProseMirror li > p { margin: 0; }
        .wiki-prose .ProseMirror blockquote { border-left: 3px solid #cbd5e1; padding-left: 1rem; color: #64748b; font-style: italic; margin: 1rem 0; }
        .wiki-prose .ProseMirror pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem 1.25rem; overflow-x: auto; margin: 1rem 0; }
        .wiki-prose .ProseMirror pre code { background: none; color: #1e293b; font-size: 0.85em; padding: 0; }
        .wiki-prose .ProseMirror code:not(pre code) { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 0.1rem 0.4rem; font-size: 0.85em; color: #4f46e5; }
        .wiki-prose .ProseMirror table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        .wiki-prose .ProseMirror th { background: #f1f5f9; font-weight: 600; color: #1e293b; text-align: left; }
        .wiki-prose .ProseMirror th, .wiki-prose .ProseMirror td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; color: #374151; }
        .wiki-prose .ProseMirror hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
        .wiki-prose .ProseMirror a { color: #2563eb; text-decoration: underline; }
        .wiki-prose .ProseMirror mark { background: #fef9c3; color: #78350f; border-radius: 2px; padding: 0 2px; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0.25rem; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li > label { margin-top: 2px; flex-shrink: 0; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li input[type="checkbox"] { width: 14px; height: 14px; accent-color: #6366f1; cursor: pointer; }
        .wiki-prose .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { opacity: 0.5; text-decoration: line-through; }
        .wiki-prose .ProseMirror .selectedCell { background: #dbeafe; }
        html.dark .wiki-prose .ProseMirror { color: #e5e7eb; }
        html.dark .wiki-prose .ProseMirror h1 { color: #fff; }
        html.dark .wiki-prose .ProseMirror h2, html.dark .wiki-prose .ProseMirror h3 { color: #f3f4f6; }
        html.dark .wiki-prose .ProseMirror p { color: #d1d5db; }
        html.dark .wiki-prose .ProseMirror p.is-empty::before { color: #4b5563; }
        html.dark .wiki-prose .ProseMirror li { color: #d1d5db; }
        html.dark .wiki-prose .ProseMirror blockquote { border-left-color: #4b5563; color: #9ca3af; }
        html.dark .wiki-prose .ProseMirror pre { background: #0f172a; border-color: #1e293b; }
        html.dark .wiki-prose .ProseMirror pre code { color: #e2e8f0; }
        html.dark .wiki-prose .ProseMirror code:not(pre code) { background: #1e293b; border-color: #334155; color: #93c5fd; }
        html.dark .wiki-prose .ProseMirror th { background: #1e293b; color: #f1f5f9; }
        html.dark .wiki-prose .ProseMirror th, html.dark .wiki-prose .ProseMirror td { border-color: #334155; color: #d1d5db; }
        html.dark .wiki-prose .ProseMirror hr { border-top-color: #374151; }
        html.dark .wiki-prose .ProseMirror a { color: #60a5fa; }
        html.dark .wiki-prose .ProseMirror mark { background: #fef08a22; color: #fef08a; }
        html.dark .wiki-prose .ProseMirror .selectedCell { background: #3730a330; }
      `}</style>
    </div>
  );
}
