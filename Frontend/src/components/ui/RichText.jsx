import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered } from "lucide-react";
import { cn } from "../../utils/cn";

const tools = [
  { name: "Bold", icon: Bold, run: (editor) => editor.chain().focus().toggleBold().run(), active: (editor) => editor.isActive("bold") },
  { name: "Italic", icon: Italic, run: (editor) => editor.chain().focus().toggleItalic().run(), active: (editor) => editor.isActive("italic") },
  { name: "Underline", icon: UnderlineIcon, run: (editor) => editor.chain().focus().toggleUnderline().run(), active: (editor) => editor.isActive("underline") },
  { name: "Bullets", icon: List, run: (editor) => editor.chain().focus().toggleBulletList().run(), active: (editor) => editor.isActive("bulletList") },
  { name: "Numbers", icon: ListOrdered, run: (editor) => editor.chain().focus().toggleOrderedList().run(), active: (editor) => editor.isActive("orderedList") },
];

export function RichText({ value, onChange, placeholder }) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || "Write here" }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "min-h-36 px-3 py-2 text-sm leading-6 text-slate-800 focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getHTML()),
  });

  useEffect(() => {
    if (!editor || !value) return;
    if (editor.getText().trim()) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="rich-text overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-1.5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.name}
              type="button"
              title={tool.name}
              onClick={() => tool.run(editor)}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white",
                tool.active(editor) && "bg-white text-indigo-700 shadow-sm"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <EditorContent editor={editor} />
      <style>{`
        .rich-text .ProseMirror p.is-empty:first-child::before,
        .rich-text .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          color: #94a3b8;
          pointer-events: none;
        }
        .rich-text .ProseMirror ul { list-style: disc; padding-left: 1.25rem; }
        .rich-text .ProseMirror ol { list-style: decimal; padding-left: 1.25rem; }
        .rich-text .ProseMirror p { margin: 0.25rem 0; }
      `}</style>
    </div>
  );
}

const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);

export function sanitizeRichText(input) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?\/?>/gi, (full, tag) => {
      const name = tag.toLowerCase();
      if (!ALLOWED.has(name)) return "";
      if (name === "br") return "<br>";
      return full.startsWith("</") ? `</${name}>` : `<${name}>`;
    })
    .trim();
}

export function plainRichText(input) {
  return sanitizeRichText(input).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function RichNote({ html, className }) {
  const safe = sanitizeRichText(html);
  if (!plainRichText(safe)) return null;
  return <div className={cn("text-sm leading-6 text-slate-700 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5", className)} dangerouslySetInnerHTML={{ __html: safe }} />;
}
