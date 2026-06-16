import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ChevronDown, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { PageTreeNode } from '../../types';
import { pagesApi } from '../../api/pages';
import { cn } from '../../utils/cn';

interface PageTreeProps {
  nodes: PageTreeNode[];
  spaceKey: string;
  onPageCreated?: (pageId: string) => void;
  onPageDeleted?: (pageId: string) => void;
  onPageRenamed?: (pageId: string, newTitle: string) => void;
}

export function PageTree({ nodes, spaceKey, onPageCreated, onPageDeleted, onPageRenamed }: PageTreeProps) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <PageTreeItem
          key={node.id}
          node={node}
          spaceKey={spaceKey}
          depth={0}
          onPageCreated={onPageCreated}
          onPageDeleted={onPageDeleted}
          onPageRenamed={onPageRenamed}
        />
      ))}
    </ul>
  );
}

interface PageTreeItemProps {
  node: PageTreeNode;
  spaceKey: string;
  depth: number;
  onPageCreated?: (pageId: string) => void;
  onPageDeleted?: (pageId: string) => void;
  onPageRenamed?: (pageId: string, newTitle: string) => void;
}

function PageTreeItem({ node, spaceKey, depth, onPageCreated, onPageDeleted, onPageRenamed }: PageTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [hovered, setHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.title);
  const { pageId } = useParams();
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;
  const isActive = pageId === node.id;
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showMenu]);

  // Focus rename input
  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const handleAddChild = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const page = await pagesApi.create(spaceKey, { parentId: node.id });
      onPageCreated?.(page.id);
      navigate(`/spaces/${spaceKey}/${page.id}/edit`);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    try {
      await pagesApi.delete(node.id);
      onPageDeleted?.(node.id);
    } catch {
      // ignore
    }
  };

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    setRenameValue(node.title);
    setRenaming(true);
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (!trimmed || trimmed === node.title) return;
    try {
      await pagesApi.rename(node.id, trimmed);
      onPageRenamed?.(node.id, trimmed);
    } catch {
      // ignore
    }
  };

  const handleRenameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setRenaming(false);
  };

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer group transition-colors text-sm',
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-gray-700 hover:bg-gray-100'
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => !renaming && navigate(`/spaces/${spaceKey}/${node.id}`)}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className={cn(
            'flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-opacity',
            hasChildren ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <span className="flex-shrink-0 text-sm">{node.emoji}</span>

        {/* Title or rename input */}
        {renaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKey}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm bg-white border border-brand-300 rounded px-1 py-0 outline-none min-w-0"
          />
        ) : (
          <span className="truncate flex-1">{node.title}</span>
        )}

        {/* Action buttons shown on hover */}
        {hovered && !renaming && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleAddChild}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400"
              title="Add child page"
            >
              <Plus size={12} />
            </button>

            {/* Three-dots menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400"
                title="More options"
              >
                <MoreHorizontal size={12} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-0.5 w-36 bg-white border rounded-lg shadow-lg z-30 py-1">
                  <button
                    onClick={startRename}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Pencil size={12} />Rename
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} />Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {expanded && node.children.length > 0 && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <PageTreeItem
              key={child.id}
              node={child}
              spaceKey={spaceKey}
              depth={depth + 1}
              onPageCreated={onPageCreated}
              onPageDeleted={onPageDeleted}
              onPageRenamed={onPageRenamed}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
