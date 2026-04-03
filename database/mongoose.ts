import mongoose from 'mongoose';

const getMongoUri = () =>
    process.env.MONGODB_URI ?? process.env.DATABASE_URL ?? process.env.MONGO_URI;

declare global {
    var mongooseCache: {
        conn: typeof mongoose | null
        promise: Promise<typeof mongoose> | null
    }
}

const cached = global.mongooseCache || (global.mongooseCache = { conn: null, promise: null });

export const connectToDB = async () => {
    if (cached.conn) return cached.conn;

    const mongoUri = getMongoUri();

    if (!mongoUri) {
        throw new Error('Please define MONGODB_URI (or DATABASE_URL / MONGO_URI) in your environment variables.');
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(mongoUri, { bufferCommands: false });
    }
    try {
        await cached.promise;
    } catch (error) {
        cached.promise = null;
        throw error;
    }
    cached.conn = await cached.promise;
    return cached.conn;
}