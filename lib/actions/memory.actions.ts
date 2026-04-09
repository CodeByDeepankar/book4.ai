'use server';

import { auth } from '@clerk/nextjs/server';
import { getRecentConversationMemories } from '@/lib/conversation-memory';

type MemoryContextResult =
    | {
        success: true;
        hasMemory: boolean;
        memoryContext: string;
        summaries: Array<{
            id: string;
            summary: string;
            createdAt: string;
            callId?: string;
        }>;
    }
    | {
        success: false;
        error: string;
        hasMemory: false;
        memoryContext: string;
        summaries: [];
    };

export const getBookConversationMemoryContext = async (
    bookId: string,
    limit: number = 4,
): Promise<MemoryContextResult> => {
    try {
        const { userId } = await auth();

        if (!userId) {
            return {
                success: false,
                error: 'Unauthorized',
                hasMemory: false,
                memoryContext: 'This is the first conversation with this listener.',
                summaries: [],
            };
        }

        const result = await getRecentConversationMemories({
            userIdentifier: userId,
            bookId,
            limit,
        });

        return {
            success: true,
            hasMemory: result.hasMemory,
            memoryContext: result.memoryContext,
            summaries: result.summaries.map((summary) => ({
                id: summary.id,
                summary: summary.summary,
                callId: summary.callId,
                createdAt: summary.createdAt.toISOString(),
            })),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to load conversation memory',
            hasMemory: false,
            memoryContext: 'This is the first conversation with this listener.',
            summaries: [],
        };
    }
};
