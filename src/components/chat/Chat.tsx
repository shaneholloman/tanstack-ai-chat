import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStore } from '@tanstack/react-store'
import {
    addMessage,
    updateChatTitle,
    saveAssistantMessage,
    streamChatResponse,
} from '@/lib/chat-actions'
import { settingsStore, AI_PROVIDERS } from '@/lib/store'
import { ChatInput } from './ChatInput'
import { EmptyChatState, MessageList } from './ChatMessages'
import type { Message, AttachedFile } from '@/types'

interface ChatProps {
    chatId: string
    initialMessages?: Message[]
}

export function Chat({ chatId, initialMessages = [] }: ChatProps) {
    const [messages, setMessages] = useState<Message[]>(initialMessages)
    const [isStreaming, setIsStreaming] = useState(false)
    const [streamingContent, setStreamingContent] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const queryClient = useQueryClient()

    const { selectedProvider, selectedModel } = useStore(settingsStore, (s) => ({
        selectedProvider: s.selectedProvider,
        selectedModel: s.selectedModel,
    }))

    useEffect(() => {
        setMessages(initialMessages)
    }, [initialMessages, chatId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingContent])

    const handleSubmit = async (userContent: string, files?: AttachedFile[]) => {
        if (!userContent.trim() || isStreaming) return

        // Check if model supports vision when files are attached
        const currentProvider = AI_PROVIDERS.find((p) => p.id === selectedProvider)
        const currentModel = currentProvider?.models.find((m) => m.id === selectedModel)
        const supportsVision = currentModel?.supportsVision || false

        if (files && files.length > 0 && !supportsVision) {
            console.error('Current model does not support images')
            return
        }

        const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: userContent,
            createdAt: new Date(),
        }
        setMessages((prev) => [...prev, userMessage])

        await addMessage({ data: { chatId, role: 'user', content: userContent } } as any)

        if (messages.length === 0) {
            await updateChatTitle({
                data: { chatId, title: userContent.slice(0, 50) },
            } as any)
            queryClient.invalidateQueries({ queryKey: ['chats'] })
        }

        setIsStreaming(true)
        setStreamingContent('')

        try {
            // Format messages for vision models if files are attached
            let allMessages
            if (files && files.length > 0 && supportsVision) {
                // When using multimodal, ALL messages must use ContentPart format
                // Filter and convert previous messages to ContentPart format
                const previousMessages = messages
                    .filter((m) => m.content && m.content.trim().length > 0) // Filter empty messages
                    .map((m) => ({
                        role: m.role,
                        content: [
                            {
                                type: 'text' as const,
                                text: m.content,
                            },
                        ],
                    }))

                // Create ContentPart array with text + images using TanStack AI format
                const contentParts: any[] = [
                    {
                        type: 'text' as const,
                        text: userContent,
                    },
                    ...files.map((file) => ({
                        type: 'image' as const,
                        source: {
                            type: 'url' as const,
                            value: file.data, // Full data URL: data:image/png;base64,...
                        },
                        metadata: {
                            detail: 'high' as const,
                        },
                    })),
                ]


                allMessages = [
                    ...previousMessages,
                    {
                        role: 'user' as const,
                        content: contentParts,
                    },
                ]

                // Debug: log messages with truncated base64
                const debugMessages = allMessages.map((msg) => ({
                    ...msg,
                    content: Array.isArray(msg.content)
                        ? msg.content.map((part: any) =>
                            part.type === 'image_url'
                                ? {
                                    type: 'image_url',
                                    image_url: {
                                        url: part.image_url.url.substring(0, 50) + '...[TRUNCATED]',
                                        detail: part.image_url.detail,
                                    },
                                }
                                : part
                        )
                        : msg.content,
                }))
                console.log(
                    '🔍 Client - Sending multimodal messages:',
                    JSON.stringify(debugMessages, null, 2)
                )
            } else {
                // Regular text-only messages
                allMessages = [
                    ...messages.map((m) => ({ role: m.role, content: m.content })),
                    { role: 'user' as const, content: userContent },
                ]
            }

            let fullContent = ''

            const stream = await streamChatResponse({
                data: {
                    chatId,
                    messages: allMessages,
                    provider: selectedProvider,
                    model: selectedModel,
                },
            } as any)

            for await (const chunk of stream) {
                if (chunk.type === 'content') {
                    fullContent = chunk.content
                    setStreamingContent(fullContent)
                }
            }

            const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: fullContent,
                createdAt: new Date(),
            }

            setMessages((prev) => [...prev, assistantMessage])
            setStreamingContent('')

            await saveAssistantMessage({
                data: { chatId, content: fullContent },
            } as any)
        } catch (error) {
            console.error('Streaming error:', error)
            const errorMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: "Sorry, I couldn't process your request. Please try again.",
                createdAt: new Date(),
            }
            setMessages((prev) => [...prev, errorMessage])
        } finally {
            setIsStreaming(false)
        }
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
                    {messages.length === 0 && !isStreaming ? (
                        <EmptyChatState />
                    ) : (
                        <>
                            <MessageList
                                messages={messages}
                                streamingContent={streamingContent}
                                isStreaming={isStreaming}
                            />
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>
            </div>

            {/* Floating input */}
            <div className="shrink-0">
                <ChatInput onSubmit={handleSubmit} isLoading={isStreaming} />
            </div>
        </div>
    )
}
