import { IBookConversation } from '@/types';
import { model, models, Schema } from 'mongoose';

const ConversationMessageSchema = new Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const BookConversationSchema = new Schema<IBookConversation>(
  {
    clerkId: { type: String, required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    messages: {
      type: [ConversationMessageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

BookConversationSchema.index({ clerkId: 1, bookId: 1 }, { unique: true });

const BookConversation =
  models.BookConversation || model<IBookConversation>('BookConversation', BookConversationSchema);

export default BookConversation;
