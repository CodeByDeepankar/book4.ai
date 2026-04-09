'use server';

import { auth } from '@clerk/nextjs/server';
import BookConversation from '@/database/models/book-conversation.model';
import { connectToDB } from '@/database/mongoose';
import { Messages } from '@/types';
import mongoose from 'mongoose';

const MAX_STORED_MESSAGES = 200;

type ConversationResult =
  | { success: true; data: Messages[] }
  | { success: false; error: string; data?: Messages[] };

type ConversationWriteResult =
  | { success: true }
  | { success: false; error: string };

const sanitizeRole = (role: string): 'user' | 'assistant' | 'system' => {
  if (role === 'assistant' || role === 'system') return role;
  return 'user';
};

const sanitizeContent = (content: string): string => content.trim();

export const getBookConversationHistory = async (
  bookId: string,
  limit: number = MAX_STORED_MESSAGES,
): Promise<ConversationResult> => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Unauthorized', data: [] };
    }

    if (!bookId || !mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book id', data: [] };
    }

    await connectToDB();

    const conversation = await BookConversation.findOne({ clerkId: userId, bookId }).lean();
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : MAX_STORED_MESSAGES;

    const history = Array.isArray(conversation?.messages)
      ? (conversation.messages as Array<{ role: string; content: string }>).slice(-safeLimit)
      : [];

    return {
      success: true,
      data: history
        .map((message: { role: string; content: string }) => ({
          role: sanitizeRole(message.role),
          content: sanitizeContent(message.content ?? ''),
        }))
        .filter((message: Messages) => !!message.content),
    };
  } catch (error) {
    console.error('Error loading conversation history', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load conversation history',
      data: [],
    };
  }
};

export const appendBookConversationMessage = async (
  bookId: string,
  message: Messages,
): Promise<ConversationWriteResult> => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!bookId || !mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book id' };
    }

    const role = sanitizeRole(message.role);
    const content = sanitizeContent(message.content);

    if (!content) {
      return { success: true };
    }

    await connectToDB();

    const conversation = await BookConversation.findOne({ clerkId: userId, bookId })
      .select({ messages: { $slice: -1 } })
      .lean();

    const lastMessage = conversation?.messages?.[0];
    const isImmediateDuplicate =
      !!lastMessage && lastMessage.role === role && sanitizeContent(lastMessage.content ?? '') === content;

    if (isImmediateDuplicate) {
      return { success: true };
    }

    await BookConversation.updateOne(
      { clerkId: userId, bookId },
      {
        $setOnInsert: { clerkId: userId, bookId },
        $push: {
          messages: {
            $each: [{ role, content, createdAt: new Date() }],
            $slice: -MAX_STORED_MESSAGES,
          },
        },
      },
      { upsert: true },
    );

    return { success: true };
  } catch (error) {
    console.error('Error appending conversation message', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to append conversation message',
    };
  }
};

export const replaceBookConversationHistory = async (
  bookId: string,
  history: Messages[],
): Promise<ConversationWriteResult> => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!bookId || !mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book id' };
    }

    await connectToDB();

    const sanitizedHistory = (Array.isArray(history) ? history : [])
      .map((message: Messages) => ({
        role: sanitizeRole(message.role),
        content: sanitizeContent(message.content ?? ''),
      }))
      .filter((message: Messages) => !!message.content)
      .slice(-MAX_STORED_MESSAGES)
      .map((message: Messages) => ({
        role: message.role,
        content: message.content,
        createdAt: new Date(),
      }));

    if (sanitizedHistory.length === 0) {
      await BookConversation.deleteOne({ clerkId: userId, bookId });
      return { success: true };
    }

    await BookConversation.updateOne(
      { clerkId: userId, bookId },
      {
        $setOnInsert: { clerkId: userId, bookId },
        $set: {
          messages: sanitizedHistory,
        },
      },
      { upsert: true },
    );

    return { success: true };
  } catch (error) {
    console.error('Error replacing conversation history', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to replace conversation history',
    };
  }
};
