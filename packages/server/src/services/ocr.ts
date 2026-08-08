/**
 * Server-side OCR.
 *
 * Deliberately optional. Mobile clients get better results faster by running
 * on-device text recognition and posting the recognized text, so `/scan`
 * accepts text directly; this engine exists for the desktop/web path where the
 * user drops in a photo, and for clients with no local OCR.
 */
export interface OcrEngine {
  recognize(image: Buffer): Promise<string>;
  dispose(): Promise<void>;
}

export interface TesseractOptions {
  language?: string;
  /**
   * Directory holding `eng.traineddata`. Without it tesseract.js downloads the
   * language data on first use, which fails on an air-gapped or egress-filtered
   * host — hence the explicit, actionable error below.
   */
  langPath?: string | null;
}

export class TesseractOcrEngine implements OcrEngine {
  private workerPromise: Promise<import('tesseract.js').Worker> | null = null;

  constructor(private readonly options: TesseractOptions = {}) {}

  private async worker() {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        const { createWorker } = await import('tesseract.js');
        const language = this.options.language ?? 'eng';
        return createWorker(
          language,
          undefined,
          this.options.langPath ? { langPath: this.options.langPath } : undefined,
        );
      })().catch((error) => {
        // Reset so a later request can retry rather than latching the failure.
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
  }

  async recognize(image: Buffer): Promise<string> {
    try {
      const worker = await this.worker();
      const { data } = await worker.recognize(image);
      return data.text;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new OcrUnavailableError(
        `Server-side OCR is unavailable (${detail}). Post recognized text as ` +
          '`{ "text": "..." }` from the client, or set TESSDATA_PATH to a directory ' +
          'containing eng.traineddata.',
      );
    }
  }

  async dispose(): Promise<void> {
    if (!this.workerPromise) return;
    const worker = await this.workerPromise.catch(() => null);
    this.workerPromise = null;
    await worker?.terminate();
  }
}

export class OcrUnavailableError extends Error {
  readonly statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = 'OcrUnavailableError';
  }
}

/** Engine that echoes pre-recognized text. Used in tests. */
export class StaticOcrEngine implements OcrEngine {
  constructor(private readonly text: string) {}
  async recognize(): Promise<string> {
    return this.text;
  }
  async dispose(): Promise<void> {}
}
