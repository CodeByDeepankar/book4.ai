import BookConversationMemory from '@/database/models/book-conversation-memory.model';
import { connectToDB } from '@/database/mongoose';
import mongoose from 'mongoose';

const DEFAULT_MEMORY_LIMIT = 4;
const MAX_MEMORY_LIMIT = 6;
const MAX_SUMMARY_LENGTH = 900;

export interface ConversationMemorySummary {
    id: string;
    userIdentifier: string;
    bookId: string;
    callId?: string;
    summary: string;
    createdAt: Date;
}

export interface MemoryLookupResult {
    summaries: ConversationMemorySummary[];
    memoryContext: string;
    hasMemory: boolean;
}

const normalizeSummary = (summary: string): string => {
    return summary
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_SUMMARY_LENGTH);
};

const normalizeUserIdentifier = (userIdentifier: string): string => {
    return userIdentifier.trim();
};

const normalizeBookId = (bookId: string): string => {
    return bookId.trim();
};

const toConversationMemorySummary = (item: {
    _id: mongoose.Types.ObjectId;
    userIdentifier: string;
    bookId: mongoose.Types.ObjectId;
    callId?: string;
    summary: string;
    createdAt?: Date;
}): ConversationMemorySummary => {
    return {
        id: String(item._id),
        userIdentifier: item.userIdentifier,
        bookId: String(item.bookId),
        callId: item.callId,
        summary: normalizeSummary(item.summary),
        createdAt: item.createdAt ?? new Date(),
    };
};

export const formatMemoryContext = (summaries: ConversationMemorySummary[]): string => {
    if (summaries.length === 0) {
        return 'This is the first conversation with this listener.';
    }

    const lines = summaries.map((summary, index) => {
        const date = summary.createdAt.toISOString().slice(0, 10);
        return `${index + 1}. [${date}]: ${summary.summary}`;
    });

    return [
        'Past conversations with this listener (most recent first):',
        ...lines,
    ].join('\n');
};

export const getRecentConversationMemories = async ({
    userIdentifier,
    bookId,
    limit = DEFAULT_MEMORY_LIMIT,
}: {
    userIdentifier: string;
    bookId: string;
    limit?: number;
}): Promise<MemoryLookupResult> => {
    const normalizedUserIdentifier = normalizeUserIdentifier(userIdentifier);
    const normalizedBookId = normalizeBookId(bookId);

    if (!normalizedUserIdentifier) {
        return {
            summaries: [],
            memoryContext: 'This is the first conversation with this listener.',
            hasMemory: false,
        };
    }

    if (!mongoose.isValidObjectId(normalizedBookId)) {
        throw new Error('Invalid book id');
    }

    await connectToDB();

    const safeLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(MAX_MEMORY_LIMIT, Math.floor(limit)))
        : DEFAULT_MEMORY_LIMIT;

    const memories = await BookConversationMemory.find({
        userIdentifier: normalizedUserIdentifier,
        bookId: normalizedBookId,
    })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean();

    const summaries = memories.map((memory) => {
        return toConversationMemorySummary({
            _id: memory._id as mongoose.Types.ObjectId,
            userIdentifier: memory.userIdentifier,
            bookId: memory.bookId as mongoose.Types.ObjectId,
            callId: typeof memory.callId === 'string' ? memory.callId : undefined,
            summary: memory.summary,
            createdAt: memory.createdAt,
        });
    });

    return {
        summaries,
        memoryContext: formatMemoryContext(summaries),
        hasMemory: summaries.length > 0,
    };
};

export const saveConversationMemorySummary = async ({
    userIdentifier,
    bookId,
    callId,
    summary,
    createdAt,
}: {
    userIdentifier: string;
    bookId: string;
    callId?: string;
    summary: string;
    createdAt?: Date;
}): Promise<{ success: true; id: string } | { success: false; error: string }> => {
    try {
        const normalizedUserIdentifier = normalizeUserIdentifier(userIdentifier);
        const normalizedBookId = normalizeBookId(bookId);
        const normalizedSummary = normalizeSummary(summary);
        const normalizedCallId = callId?.trim();

        if (!normalizedUserIdentifier) {
            return { success: false, error: 'Missing user identifier' };
        }

        if (!mongoose.isValidObjectId(normalizedBookId)) {
            return { success: false, error: 'Invalid book id' };
        }

        if (!normalizedSummary) {
            return { success: false, error: 'Missing summary' };
        }

        await connectToDB();

        if (normalizedCallId) {
            const upsertResult = await BookConversationMemory.findOneAndUpdate(
                { callId: normalizedCallId },
                {
                    $setOnInsert: {
                        userIdentifier: normalizedUserIdentifier,
                        bookId: new mongoose.Types.ObjectId(normalizedBookId),
                        callId: normalizedCallId,
                        createdAt: createdAt ?? new Date(),
                    },
                    $set: {
                        summary: normalizedSummary,
                    },
                },
                { upsert: true, new: true },
            ).lean();

            if (!upsertResult?._id) {
                return { success: false, error: 'Failed to save conversation summary' };
            }

            return { success: true, id: String(upsertResult._id) };
        }

        const created = await BookConversationMemory.create({
            userIdentifier: normalizedUserIdentifier,
            bookId: new mongoose.Types.ObjectId(normalizedBookId),
            summary: normalizedSummary,
            createdAt: createdAt ?? new Date(),
        });

        return { success: true, id: String(created._id) };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save conversation summary',
        };
    }
};

export const deleteConversationMemoriesForUserBook = async ({
    userIdentifier,
    bookId,
}: {
    userIdentifier: string;
    bookId: string;
}): Promise<number> => {
    const normalizedUserIdentifier = normalizeUserIdentifier(userIdentifier);
    const normalizedBookId = normalizeBookId(bookId);

    if (!normalizedUserIdentifier || !mongoose.isValidObjectId(normalizedBookId)) {
        return 0;
    }

    await connectToDB();

    const result = await BookConversationMemory.deleteMany({
        userIdentifier: normalizedUserIdentifier,
        bookId: normalizedBookId,
    });

    return result.deletedCount ?? 0;
};
