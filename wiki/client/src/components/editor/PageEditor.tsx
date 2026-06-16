import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { EditorToolbar } from './EditorToolbar';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

interface PageEditorProps {
  content: string;
  onChange: (html: string) => void;
  editable?: boolean;
  className?: string;
}

export function PageEditor({ content, onChange, editable = true, className }: PageEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { languageClassPrefix: 'language-' } }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-brand-600 underline' } }),
      Image,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Typography,
      Placeholder.configure({ placeholder: 'Start typing, or type / for commands…' }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      {editable && <EditorToolbar editor={editor} />}

      {editable && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-0.5 bg-gray-900 text-white rounded-lg shadow-lg px-1.5 py-1"
        >
          {[
            { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), title: 'Bold' },
            { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), title: 'Italic' },
            { icon: UnderlineIcon, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), title: 'Underline' },
          ].map(({ icon: Icon, action, active, title }) => (
            <button
              key={title}
              onMouseDown={(e) => { e.preventDefault(); action(); }}
              title={title}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded text-sm',
                active ? 'bg-white/20' : 'hover:bg-white/10'
              )}
            >
              <Icon size={13} />
            </button>
          ))}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              const url = window.prompt('URL:');
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10"
            title="Link"
          >
            <LinkIcon size={13} />
          </button>
        </BubbleMenu>
      )}

      <div className="px-8 py-6">
        <EditorContent
          editor={editor}
          className={cn(
            'prose prose-gray max-w-none min-h-[400px]',
            'focus:outline-none',
            '[&_.ProseMirror]:outline-none',
            '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400',
            '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
            '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
            '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none'
          )}
        />
      </div>
    </div>
  );
}
