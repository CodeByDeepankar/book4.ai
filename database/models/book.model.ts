import { IBook } from '@/types';
import {model, models, Schema} from 'mongoose';

const BookSchema = new Schema<IBook>({
    clerkId: { type: String, required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    author: { type: String, required: true },
    persona: { type: String },
    fileURL: { type: String, required: true },
    fileBlobKey: { type: String, required: true },
    coverURL: { type: String, required: true },
    coverBlobKey: { type: String },
    fileSize: { type: Number, required: true },
    totalSegments: { type: Number, required: true },
}, { timestamps: true
});

const Book = models.Book || model<IBook>('Book', BookSchema);

export default Book;