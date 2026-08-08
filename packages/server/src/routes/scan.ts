import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { OcrUnavailableError } from '../services/ocr.js';
import { scanFromImage, scanFromText } from '../services/scan.js';

const textScanBody = z.object({
  /** Text already recognized on-device. */
  text: z.string().min(1).max(4_000).optional(),
  /** Base64 image, for clients that cannot send multipart. */
  imageBase64: z.string().min(32).optional(),
  limit: z.number().int().min(1).max(25).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

/** Guard against a decoded base64 payload blowing past the upload limit. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function registerScanRoutes(app: FastifyInstance, context: AppContext): void {
  /**
   * Three ways in, because the right one differs per platform:
   *  - `text`: mobile runs on-device OCR and posts what it read (fastest).
   *  - `imageBase64` / multipart: desktop and web upload the photo itself.
   */
  app.post('/api/scan', async (request, reply) => {
    try {
      if (request.isMultipart()) {
        const file = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
        if (!file) return reply.code(400).send({ error: 'missing_file' });
        const buffer = await file.toBuffer();
        return await scanFromImage(context.db, context.ocr, buffer);
      }

      const body = textScanBody.parse(request.body ?? {});
      const options = { limit: body.limit, minScore: body.minScore };

      if (body.text) return scanFromText(context.db, body.text, options);

      if (body.imageBase64) {
        const buffer = Buffer.from(body.imageBase64, 'base64');
        if (buffer.length === 0) return reply.code(400).send({ error: 'invalid_image' });
        if (buffer.length > MAX_IMAGE_BYTES) {
          return reply.code(413).send({ error: 'image_too_large', maxBytes: MAX_IMAGE_BYTES });
        }
        return await scanFromImage(context.db, context.ocr, buffer, options);
      }

      return reply.code(400).send({ error: 'missing_text_or_image' });
    } catch (error) {
      if (error instanceof OcrUnavailableError) {
        return reply.code(error.statusCode).send({ error: 'ocr_unavailable', message: error.message });
      }
      throw error;
    }
  });
}
