import { markdown } from "@codemirror/lang-markdown"
import { bracketMatching, indentOnInput } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { oneDark } from "@codemirror/theme-one-dark"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
} from "@codemirror/view"
import * as React from "react"

import type { Channel } from "../../stores/channel-store"

interface PromptsEditorProps {
  channel: Channel
}

const editorTheme = EditorView.theme({
  "&": { backgroundColor: "#0D0D0D", height: "100%" },
  ".cm-gutters": { backgroundColor: "#0D0D0D", border: "none" },
  ".cm-content": { caretColor: "var(--accent-primary)" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.03)" },
})

export function PromptsEditor({ channel }: PromptsEditorProps) {
  const [files, setFiles] = React.useState<string[]>([])
  const [activeFile, setActiveFile] = React.useState<string | null>(null)
  const [unsaved, setUnsaved] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const editorContainerRef = React.useRef<HTMLDivElement>(null)
  const editorViewRef = React.useRef<EditorView | null>(null)

  // Load file list
  React.useEffect(() => {
    window.api
      .getPromptFiles(channel.id)
      .then((list: string[]) => {
        setFiles(list)
        if (list.length > 0 && !activeFile) {
          setActiveFile(list[0])
        }
      })
      .catch(() => setFiles([]))
  }, [channel.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize or update editor when active file changes
  React.useEffect(() => {
    if (!activeFile || !editorContainerRef.current) return

    // Destroy previous editor
    if (editorViewRef.current) {
      editorViewRef.current.destroy()
      editorViewRef.current = null
    }

    let cancelled = false

    window.api
      .readPrompt(channel.id, activeFile)
      .then((content: string) => {
        if (cancelled || !editorContainerRef.current) return

        const state = EditorState.create({
          doc: content,
          extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            drawSelection(),
            indentOnInput(),
            bracketMatching(),
            highlightActiveLine(),
            markdown(),
            oneDark,
            editorTheme,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                setUnsaved(true)
              }
            }),
          ],
        })

        const view = new EditorView({
          state,
          parent: editorContainerRef.current,
        })

        editorViewRef.current = view
        setUnsaved(false)
      })
      .catch(() => {
        // Could not read prompt file
      })

    return () => {
      cancelled = true
    }
  }, [channel.id, activeFile])

  // Cleanup editor on unmount
  React.useEffect(() => {
    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy()
      }
    }
  }, [])

  const handleSave = async () => {
    if (!activeFile || !editorViewRef.current) return
    setSaving(true)
    try {
      const content = editorViewRef.current.state.doc.toString()
      await window.api.savePrompt(channel.id, activeFile, content)
      setUnsaved(false)
    } finally {
      setSaving(false)
    }
  }

  const handleFileSelect = (fileName: string) => {
    if (fileName === activeFile) return
    setActiveFile(fileName)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--fg-primary)]">Prompt Templates</h2>
        <button
          type="button"
          className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving || !unsaved}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Split layout */}
      <div className="flex h-[600px] overflow-hidden rounded-xl border border-[var(--border-subtle)]">
        {/* File list sidebar */}
        <div className="flex w-[200px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-secondary)]">
          <div className="border-b border-[var(--border-subtle)] px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">
              Files
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
            {files.map((fileName) => (
              <button
                key={fileName}
                type="button"
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                  activeFile === fileName
                    ? "bg-[var(--surface-tertiary)] text-[var(--fg-primary)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg-secondary)]"
                }`}
                onClick={() => handleFileSelect(fileName)}
              >
                <span className="text-xs">&#x1F4C4;</span>
                <span className="truncate font-mono text-xs">{fileName}</span>
              </button>
            ))}
            {files.length === 0 && (
              <div className="px-2.5 py-3 text-xs text-[var(--fg-muted)]">
                No prompt files found
              </div>
            )}
          </div>
        </div>

        {/* Editor area */}
        <div className="flex flex-1 flex-col bg-[#0D0D0D]">
          {/* Tab bar */}
          {activeFile && (
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-2">
              <span className="font-mono text-xs text-[var(--fg-secondary)]">{activeFile}</span>
              {unsaved && (
                <span
                  className="inline-block size-2 rounded-full bg-[var(--accent-primary)]"
                  title="Unsaved changes"
                />
              )}
            </div>
          )}

          {/* CodeMirror container */}
          <div ref={editorContainerRef} className="flex-1 overflow-auto" />

          {!activeFile && (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--fg-muted)]">
              Select a file to edit
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
