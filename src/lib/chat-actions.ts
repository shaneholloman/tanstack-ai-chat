import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { chats, messages } from '@/db/schema'
import { desc, eq, asc } from 'drizzle-orm'
import { chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'
import { anthropic } from '@tanstack/ai-anthropic'
import { gemini } from '@tanstack/ai-gemini'

// Get all chats
export const getChats = createServerFn({
    method: 'GET',
}).handler(async () => {
    return await db.query.chats.findMany({
        orderBy: [desc(chats.createdAt)],
    })
})

// Search chats and messages
export const searchChats = createServerFn({
    method: 'POST',
}).handler(async (ctx) => {
    if (!ctx.data) return []
    const { query } = ctx.data as { query: string }

    if (!query || query.trim().length === 0) {
        return []
    }

    const searchTerm = query.toLowerCase()

    // Get all chats
    const allChats = await db.query.chats.findMany()

    // Get all messages
    const allMessages = await db.select().from(messages)

    // Filter chats by title or message content
    const results = allChats
        .map((chat) => {
            const chatMessages = allMessages.filter((m) => m.chatId === chat.id)
            const matchedMessage = chatMessages.find((m) =>
                m.content.toLowerCase().includes(searchTerm),
            )

            const titleMatch = chat.title.toLowerCase().includes(searchTerm)

            if (titleMatch || matchedMessage) {
                return {
                    chatId: chat.id,
                    chatTitle: chat.title,
                    matchedContent: matchedMessage?.content || null,
                }
            }
            return null
        })
        .filter((r) => r !== null)
        .slice(0, 20)

    return results
})

// Get a single chat with messages
export const getChatWithMessages = createServerFn({
    method: 'GET',
}).handler(async (ctx) => {
    if (!ctx.data) throw new Error('Chat ID required')
    const { chatId } = ctx.data as { chatId: string }

    const chatRecord = await db.query.chats.findFirst({
        where: eq(chats.id, chatId),
    })

    const chatMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(asc(messages.createdAt))

    return { chat: chatRecord, messages: chatMessages }
})

// Create a new chat
export const createChat = createServerFn({
    method: 'POST',
}).handler(async (ctx) => {
    const { title } = (ctx.data || {}) as { title?: string }

    const [newChat] = await db
        .insert(chats)
        .values({ title: title || 'New Chat' })
        .returning()

    return newChat
})

// Add a message to a chat
export const addMessage = createServerFn({
    method: 'POST',
}).handler(async (ctx) => {
    if (!ctx.data) throw new Error('Message data required')
    const { chatId, role, content } = ctx.data as {
        chatId: string
        role: 'user' | 'assistant'
        content: string
    }

    const [newMessage] = await db
        .insert(messages)
        .values({ chatId, role, content })
        .returning()

    return newMessage
})

// Update chat title
export const updateChatTitle = createServerFn({
    method: 'POST',
}).handler(async (ctx) => {
    if (!ctx.data) throw new Error('Chat data required')
    const { chatId, title } = ctx.data as { chatId: string; title: string }

    await db
        .update(chats)
        .set({ title, updatedAt: new Date() })
        .where(eq(chats.id, chatId))
})

// Delete a chat
export const deleteChat = createServerFn({
    method: 'POST',
}).handler(async (ctx) => {
    if (!ctx.data) throw new Error('Chat ID required')
    const { chatId } = ctx.data as { chatId: string }

    // Delete chat (messages will be cascade deleted due to foreign key constraint)
    await db.delete(chats).where(eq(chats.id, chatId))

    return { success: true }
})

// Toggle chat pin status
export const toggleChatPin = createServerFn({
    method: 'POST',
}).handler(async (ctx) => {
    if (!ctx.data) throw new Error('Chat ID required')
    const { chatId } = ctx.data as { chatId: string }

    // Get current pin status
    const [chat] = await db.select().from(chats).where(eq(chats.id, chatId))

    if (!chat) throw new Error('Chat not found')

    // Toggle the pin status
    await db
        .update(chats)
        .set({ isPinned: !chat.isPinned, updatedAt: new Date() })
        .where(eq(chats.id, chatId))

    return { success: true, isPinned: !chat.isPinned }
})

// Stream chat response
export const streamChatResponse = createServerFn({
    method: 'POST',
}).handler(async function* (ctx) {
    if (!ctx.data) throw new Error('Stream data required')
    const data = ctx.data as {
        chatId: string
        messages: Array<{
            role: 'user' | 'assistant'
            content: string | Array<{ type: string; text?: string; source?: any; metadata?: any }>
        }>
        provider?: string
        model?: string
    }

    const provider = data.provider || 'openai'
    const model = data.model || 'gpt-4o-mini'

    const filteredMessages = data.messages.filter((m) => {
        if (typeof m.content === 'string') {
            return m.content && m.content.trim().length > 0
        }
        return m.content && m.content.length > 0
    })


    // Select adapter and create stream based on provider
    if (provider === 'anthropic') {
        const adapter = anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
        const stream = chat({
            adapter,
            model: model as any,
            messages: filteredMessages as any, // Cast to any for multimodal content
        })
        for await (const chunk of stream) {
            if (chunk.type === 'content') {
                yield { type: 'content', content: chunk.content }
            }
        }
    } else if (provider === 'gemini') {
        const adapter = gemini({ apiKey: process.env.GEMINI_API_KEY! } as any)
        const stream = chat({
            adapter,
            model: model as any,
            messages: filteredMessages as any, // Cast to any for multimodal content
        })
        for await (const chunk of stream) {
            if (chunk.type === 'content') {
                yield { type: 'content', content: chunk.content }
            }
        }
    } else {
        // OpenAI - Debug with truncated base64
        const debugMessages = filteredMessages.map((msg: any) => ({
            ...msg,
            content: Array.isArray(msg.content)
                ? msg.content.map((part: any) =>
                    part.type === 'image_url'
                        ? {
                            type: 'image_url',
                            image_url: {
                                url: part.image_url?.url?.substring(0, 50) + '...[TRUNCATED]',
                                detail: part.image_url?.detail,
                            },
                        }
                        : part
                )
                : msg.content,
        }))
        console.log('🔍 OpenAI - Messages:', JSON.stringify(debugMessages, null, 2))
        const adapter = openai()

        try {
            console.log('🔍 Starting OpenAI stream...')
            const stream = chat({
                adapter,
                model: model as any,
                messages: filteredMessages as any,
            })
            let chunkCount = 0
            for await (const chunk of stream) {
                console.log('🔍 Received chunk:', chunk.type)
                if (chunk.type === 'content') {
                    chunkCount++
                    yield { type: 'content', content: chunk.content }
                }
            }
            console.log('🔍 Stream complete. Total content chunks:', chunkCount)
        } catch (error: any) {
            console.error('>>> chatStream: Fatal error during response creation <<<')
            console.error('>>> Error message:', error.message)
            console.error('>>> Error stack:', error.stack)
            console.error('>>> Full error:', error)
            throw error
        }
    }

})

// Save assistant message
export const saveAssistantMessage = createServerFn({
    method: 'POST',
}).handler(async (ctx) => {
    if (!ctx.data) throw new Error('Message data required')
    const { chatId, content } = ctx.data as { chatId: string; content: string }

    const [savedMessage] = await db
        .insert(messages)
        .values({
            chatId,
            role: 'assistant',
            content,
        })
        .returning()

    return savedMessage
})
