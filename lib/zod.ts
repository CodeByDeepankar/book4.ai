import { z } from 'zod';

import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_PDF_TYPES,
  MAX_FILE_SIZE,
  MAX_IMAGE_SIZE,
} from '@/lib/constants';

const isFile = (value: unknown): value is File =>
  typeof File !== 'undefined' && value instanceof File;

const pdfFileSchema = z
  .custom<File>(isFile, { message: 'Please upload a PDF file.' })
  .refine((file) => ACCEPTED_PDF_TYPES.includes(file.type), {
    message: 'Only PDF files are allowed.',
  })
  .refine((file) => file.size <= MAX_FILE_SIZE, {
    message: 'PDF file must be 50MB or smaller.',
  });

const coverImageSchema = z
  .custom<File | undefined>((value) => value === undefined || isFile(value), {
    message: 'Please upload a valid image file.',
  })
  .refine((file) => !file || ACCEPTED_IMAGE_TYPES.includes(file.type), {
    message: 'Cover image must be JPG, PNG, or WEBP.',
  })
  .refine((file) => !file || file.size <= MAX_IMAGE_SIZE, {
    message: 'Cover image must be 10MB or smaller.',
  });

export const UploadSchema = z.object({
  pdfFile: pdfFileSchema,
  coverImage: coverImageSchema,
  title: z.string().trim().min(1, { message: 'Title is required.' }),
  author: z.string().trim().min(1, { message: 'Author name is required.' }),
  voice: z.enum(['dave', 'daniel', 'chris', 'rachel', 'sarah']),
});

export type UploadFormValues = z.infer<typeof UploadSchema>;
