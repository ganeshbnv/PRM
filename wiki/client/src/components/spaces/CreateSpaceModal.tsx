import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { spacesApi } from '../../api/spaces';
import type { Space } from '../../types';

interface CreateSpaceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (space: Space) => void;
}

export function CreateSpaceModal({ open, onClose, onCreated }: CreateSpaceModalProps) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📄');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (name) {
      const auto = name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10);
      setKey(auto);
    }
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !key) return;
    setLoading(true);
    setError('');
    try {
      const space = await spacesApi.create({ name, key, description, iconEmoji: emoji, isPrivate });
      onCreated(space);
      onClose();
      setName(''); setKey(''); setDescription('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create space';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Space" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="w-12 h-12 text-2xl text-center border rounded-lg"
            maxLength={2}
            title="Space emoji"
          />
          <Input
            label="Space name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Engineering Wiki"
            required
            className="flex-1"
          />
        </div>

        <Input
          label="Space key"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
          placeholder="ENG"
          helper="2–10 uppercase letters/numbers. Used in URLs."
          required
        />

        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this space is for..."
        />

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="rounded"
          />
          Private space (only members can see it)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Space</Button>
        </div>
      </form>
    </Modal>
  );
}
