'use server';

import { auth } from '@clerk/nextjs/server';
import VoiceSession from '@/database/models/voice-session.model';
import BookConversation from '@/database/models/book-conversation.model';
import { connectToDB } from '@/database/mongoose';
import { deleteConversationMemoriesForUserBook } from '@/lib/conversation-memory';
import mongoose from 'mongoose';

const DEFAULT_MAX_DURATION_MINUTES = 15;

type StartVoiceSessionResult =
  | { success: true; sessionId: string; maxDurationMinutes: number }
  | { success: false; error: string; isBillingError?: boolean };

type EndVoiceSessionResult =
  | { success: true }
  | { success: false; error: string };

type ClearBookSessionDataResult =
  | { success: true; deletedSessions: number; deletedConversation: boolean; deletedMemories: number }
  | { success: false; error: string };

const getBillingPeriodStart = (date: Date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
};

export const startVoiceSession = async (
  clerkId: string,
  bookId: string,
): Promise<StartVoiceSessionResult> => {
  try {
    const { userId } = await auth();

    if (!userId || userId !== clerkId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!bookId || !mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book id' };
    }

    await connectToDB();

    const session = await VoiceSession.create({
      clerkId: userId,
      bookId: new mongoose.Types.ObjectId(bookId),
      startedAt: new Date(),
      durationSeconds: 0,
      billingPeriodStart: getBillingPeriodStart(),
    });

    return {
      success: true,
      sessionId: String(session._id),
      maxDurationMinutes: DEFAULT_MAX_DURATION_MINUTES,
    };
  } catch (error) {
    console.error('Error starting voice session', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start voice session',
    };
  }
};

export const endVoiceSession = async (
  sessionId: string,
  durationSeconds: number,
): Promise<EndVoiceSessionResult> => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
      return { success: false, error: 'Invalid session id' };
    }

    await connectToDB();

    const safeDurationSeconds = Number.isFinite(durationSeconds)
      ? Math.max(0, Math.floor(durationSeconds))
      : 0;

    const session = await VoiceSession.findOneAndUpdate(
      { _id: sessionId, clerkId: userId },
      {
        endedAt: new Date(),
        durationSeconds: safeDurationSeconds,
      },
      { new: true },
    ).lean();

    if (!session) {
      return { success: false, error: 'Voice session not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error ending voice session', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to end voice session',
    };
  }
};

export const clearBookSessionData = async (
  bookId: string,
): Promise<ClearBookSessionDataResult> => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!bookId || !mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book id' };
    }

    await connectToDB();

    const [voiceDeleteResult, conversationDeleteResult, deletedMemories] = await Promise.all([
      VoiceSession.deleteMany({ clerkId: userId, bookId }),
      BookConversation.deleteOne({ clerkId: userId, bookId }),
      deleteConversationMemoriesForUserBook({ userIdentifier: userId, bookId }),
    ]);

    return {
      success: true,
      deletedSessions: voiceDeleteResult.deletedCount ?? 0,
      deletedConversation: (conversationDeleteResult.deletedCount ?? 0) > 0,
      deletedMemories,
    };
  } catch (error) {
    console.error('Error clearing book session data', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear session data',
    };
  }
};
