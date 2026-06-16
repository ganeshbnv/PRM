import { useEffect, useState } from 'react';
import { Lock, Globe, Users, X, Search, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Avatar } from '../common/Avatar';
import { pagesApi } from '../../api/pages';
import { usersApi, type UserSearchResult } from '../../api/users';
import type { Page, PageAccessEntry } from '../../types';
import { cn } from '../../utils/cn';

interface PageAccessModalProps {
  open: boolean;
  onClose: () => void;
  page: Page;
  onSaved: (updated: Pick<Page, 'isPrivate'>) => void;
}

type Visibility = 'public' | 'private' | 'restricted';

export function PageAccessModal({ open, onClose, page, onSaved }: PageAccessModalProps) {
  const [visibility, setVisibility] = useState<Visibility>(
    !page.isPrivate ? 'public' : 'private'
  );
  const [accessList, setAccessList] = useState<PageAccessEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVisibility(!page.isPrivate ? 'public' : 'private');
    pagesApi.getAccess(page.id).then(setAccessList).catch(() => {});
  }, [open, page.id, page.isPrivate]);

  // Debounced user search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await usersApi.search(searchQuery);
        // Filter out already-granted users
        const grantedIds = new Set(accessList.map((a) => a.user.id));
        setSearchResults(results.filter((u) => !grantedIds.has(u.id)));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, accessList]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const isPrivate = visibility !== 'public';
      await pagesApi.update(page.id, { isPrivate });
      onSaved({ isPrivate });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const grantAccess = async (user: UserSearchResult) => {
    try {
      const entry = await pagesApi.grantAccess(page.id, user.id);
      setAccessList((prev) => [...prev, entry]);
      setSearchQuery('');
      setSearchResults([]);
    } catch {
      // ignore
    }
  };

  const revokeAccess = async (userId: string) => {
    try {
      await pagesApi.revokeAccess(page.id, userId);
      setAccessList((prev) => prev.filter((a) => a.user.id !== userId));
    } catch {
      // ignore
    }
  };

  const options: Array<{ value: Visibility; icon: React.ReactNode; label: string; desc: string }> = [
    {
      value: 'public',
      icon: <Globe size={16} />,
      label: 'Public',
      desc: 'Everyone in this space can view this page',
    },
    {
      value: 'private',
      icon: <Lock size={16} />,
      label: 'Private',
      desc: 'Only you (the author) can view this page',
    },
    {
      value: 'restricted',
      icon: <Users size={16} />,
      label: 'Restricted',
      desc: 'Only selected users can view this page',
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Page Access" size="md">
      <div className="space-y-5">

        {/* Visibility options */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Visibility</p>
          <div className="space-y-2">
            {options.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  visibility === opt.value
                    ? 'border-brand-400 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={opt.value}
                  checked={visibility === opt.value}
                  onChange={() => setVisibility(opt.value)}
                  className="mt-0.5 accent-brand-600"
                />
                <span className={cn('mt-0.5 flex-shrink-0', visibility === opt.value ? 'text-brand-600' : 'text-gray-500')}>
                  {opt.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                  <span className="block text-xs text-gray-500">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* User search — only shown for "restricted" */}
        {visibility === 'restricted' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Grant access to users</p>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              {searching && (
                <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              )}
            </div>

            {searchResults.length > 0 && (
              <ul className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                {searchResults.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => grantAccess(u)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                    >
                      <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{u.name}</span>
                        <span className="block text-xs text-gray-500">{u.email}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Current access list */}
            {accessList.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-medium">Has access</p>
                <ul className="border rounded-lg divide-y">
                  {accessList.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                      <Avatar name={entry.user.name} avatarUrl={entry.user.avatarUrl} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{entry.user.name}</span>
                        <span className="block text-xs text-gray-500">{entry.user.email}</span>
                      </span>
                      <button
                        onClick={() => revokeAccess(entry.user.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove access"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
