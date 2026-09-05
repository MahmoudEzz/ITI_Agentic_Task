import { sniffFileType } from "../../domain/services/sniffFileType.js";
import { ValidationError } from "../../domain/errors/index.js";

// Runs before extraction (ingestDocument.js) — an unsupported/oversized/
// mislabeled upload is rejected here, deterministically, rather than being
// handed to an extractor that might mis-parse it or a downstream step that
// assumes its declared format is trustworthy.
export function validateUpload({ sourceFormat, fileBuffer, maxSizeBytes }) {
  if (fileBuffer.length > maxSizeBytes) {
    throw new ValidationError(`Upload exceeds the maximum allowed size of ${maxSizeBytes} bytes (got ${fileBuffer.length})`);
  }

  const detectedFormat = sniffFileType(fileBuffer);
  if (detectedFormat !== sourceFormat) {
    throw new ValidationError(
      `Upload content does not match its declared sourceFormat "${sourceFormat}" (content-sniffing detected "${detectedFormat}") — the declared format/extension is never trusted`,
    );
  }
}
