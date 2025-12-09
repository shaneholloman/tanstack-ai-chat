import { useState, useRef } from 'react'
import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Button } from '../ui/button'
import { ArrowUp, Plus, X } from 'lucide-react'
import { settingsStore, AI_PROVIDERS } from '@/lib/store'
import type { AttachedFile } from '@/types/chat'

interface ChatInputProps {
    onSubmit: (message: string, files?: AttachedFile[]) => void
    isLoading: boolean
}

function FieldInfo({ field }: { field: AnyFieldApi }) {
    return (
        <>
            {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                <div className="px-4 text-sm text-destructive">
                    {field.state.meta.errors.map((error, i) => (
                        <p key={i}>{error}</p>
                    ))}
                </div>
            ) : null}
        </>
    )
}

export function ChatInput({ onSubmit, isLoading }: ChatInputProps) {
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { selectedProvider, selectedModel } = useStore(settingsStore, (s) => ({
        selectedProvider: s.selectedProvider,
        selectedModel: s.selectedModel,
    }))

    // Check if current model supports files
    const currentProvider = AI_PROVIDERS.find((p) => p.id === selectedProvider)
    const currentModel = currentProvider?.models.find((m) => m.id === selectedModel)
    const supportsFiles = currentModel?.supportsVision || false

    const form = useForm({
        defaultValues: {
            message: '',
        },
        onSubmit: async ({ value }) => {
            onSubmit(value.message, attachedFiles.length > 0 ? attachedFiles : undefined)
            form.reset()
            setAttachedFiles([])
        },
    })

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            form.handleSubmit()
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || !supportsFiles) return

        const newFiles: AttachedFile[] = []

        for (let i = 0; i < files.length; i++) {
            const file = files[i]

            if (!file.type.startsWith('image/')) continue

            const reader = new FileReader()
            const base64 = await new Promise<string>((resolve) => {
                reader.onload = () => resolve(reader.result as string)
                reader.readAsDataURL(file)
            })

            newFiles.push({
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: base64,
                preview: base64,
            })
        }

        setAttachedFiles([...attachedFiles, ...newFiles])
    }

    return (
        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-6">
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    form.handleSubmit()
                }}
                className="max-w-3xl mx-auto px-4"
            >
                <div className="relative flex flex-col gap-2">
                    {/* Input container with texture */}
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-border/40 via-transparent to-border/40 rounded-xl" />

                        <div className="relative flex flex-col gap-3 bg-card/80 backdrop-blur-sm rounded-xl p-3 border border-border/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)] transition-all duration-200">

                            {/* File Previews - ABOVE input */}
                            {attachedFiles.length > 0 && (
                                <div className="flex gap-2 flex-wrap">
                                    {attachedFiles.map((file) => (
                                        <div
                                            key={file.id}
                                            className="relative group rounded-lg overflow-hidden border bg-muted"
                                        >
                                            <img
                                                src={file.preview}
                                                alt={file.name}
                                                className="h-20 w-20 object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setAttachedFiles(attachedFiles.filter((f) => f.id !== file.id))
                                                }
                                                className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Input row */}
                            <div className="flex items-end gap-2">
                                {/* File Button */}
                                <div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={handleFileSelect}
                                        disabled={!supportsFiles}
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={!supportsFiles}
                                        className="shrink-0 h-10 w-10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                        title={
                                            supportsFiles
                                                ? 'Attach image'
                                                : 'Model does not support images'
                                        }
                                    >
                                        <Plus className="h-5 w-5" />
                                    </Button>
                                </div>

                                {/* Textarea */}
                                <div className="flex-1 bg-background/40 rounded-lg p-2">
                                    <form.Field
                                        name="message"
                                        validators={{
                                            onChange: ({ value }) =>
                                                !value || value.trim().length === 0
                                                    ? 'Message cannot be empty'
                                                    : value.length > 4000
                                                        ? 'Message is too long (max 4000 characters)'
                                                        : undefined,
                                        }}
                                    >
                                        {(field) => (
                                            <textarea
                                                value={field.state.value}
                                                onChange={(e) => field.handleChange(e.target.value)}
                                                onBlur={field.handleBlur}
                                                onKeyDown={handleKeyDown}
                                                placeholder="Type your message..."
                                                className="w-full bg-transparent border-0 resize-none focus:ring-0 focus:outline-none min-h-[52px] max-h-[200px] py-2 px-3 text-sm placeholder:text-muted-foreground/50 leading-relaxed"
                                                rows={1}
                                                disabled={isLoading}
                                            />
                                        )}
                                    </form.Field>
                                </div>

                                {/* Send button */}
                                <form.Subscribe
                                    selector={(state) => ({
                                        canSubmit: state.canSubmit,
                                        isSubmitting: state.isSubmitting,
                                    })}
                                >
                                    {(state) => (
                                        <Button
                                            type="submit"
                                            size="icon"
                                            disabled={isLoading || !state.canSubmit || state.isSubmitting}
                                            className="shrink-0 rounded-xl h-11 w-11 m-1 shadow-sm hover:shadow-md transition-all duration-200"
                                        >
                                            <ArrowUp className="h-5 w-5" />
                                        </Button>
                                    )}
                                </form.Subscribe>
                            </div>
                        </div>
                    </div>

                    {/* Error display */}
                    <form.Field name="message">
                        {(field) => <FieldInfo field={field} />}
                    </form.Field>
                </div>
            </form>
        </div>
    )
}
