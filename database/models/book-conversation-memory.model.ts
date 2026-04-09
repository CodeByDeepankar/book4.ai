import { IBookConversationMemory } from '@/types';
import { model, models, Schema } from 'mongoose';

const BookConversationMemorySchema = new Schema<IBookConversationMemory>(
    {
        userIdentifier: { type: String, required: true, trim: true, index: true },
        bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
        callId: { type: String, trim: true, index: true, sparse: true },
        summary: { type: String, required: true, trim: true, maxlength: 1200 },
    },
    {
        timestamps: true,
    },
);

BookConversationMemorySchema.index({ userIdentifier: 1, bookId: 1, createdAt: -1 });
BookConversationMemorySchema.index({ callId: 1 }, { unique: true, sparse: true });

const BookConversationMemory =
    models.BookConversationMemory || model<IBookConversationMemory>('BookConversationMemory', BookConversationMemorySchema);

export default BookConversationMemory;
