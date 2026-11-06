import { formatCsv, formatSrt, formatVtt } from './subtitles.js';

/**
 * @typedef {import('../whisper/integration.js').TranscriptionResult} TranscriptionResult
 * @typedef {import('../whisper/integration.js').Segment} Segment
 * @typedef {{ chunkIndex: number, startOffset: number, result: TranscriptionResult }} ChunkTranscription
 */

/**
 * Joins the transcriptions of overlapping audio chunks into one transcription.
 * @param {ChunkTranscription[]} chunks `startOffset` is in seconds.
 * @param {{ overlapSeconds?: number, removeOverlapDuplicates?: boolean,
 *   preserveTimestamps?: boolean }} options
 * @returns {TranscriptionResult}
 */
export function assembleTranscriptions(chunks, options = {}) {
  const {
    overlapSeconds = 30,
    removeOverlapDuplicates = true,
    preserveTimestamps = true,
  } = options;

  if (chunks.length === 0) {
    return { text: '', model_used: 'base.en', processing_time: 0 };
  }

  if (chunks.length === 1) {
    return chunks[0].result;
  }

  const sortedChunks = chunks.toSorted((a, b) => a.chunkIndex - b.chunkIndex);

  let assembledText = '';
  const assembledSegments = [];
  let totalProcessingTime = 0;

  for (const [index, chunk] of sortedChunks.entries()) {
    const isFirstChunk = index === 0;
    totalProcessingTime += chunk.result.processing_time;

    if (preserveTimestamps && chunk.result.segments) {
      const shiftedSegments = shiftSegments(chunk.result.segments, chunk.startOffset);

      if (removeOverlapDuplicates && !isFirstChunk) {
        assembledSegments.push(
          ...removeOverlapSegments(shiftedSegments, assembledSegments, overlapSeconds),
        );
      } else {
        assembledSegments.push(...shiftedSegments);
      }
    }

    let chunkText = chunk.result.text;
    if (removeOverlapDuplicates && !isFirstChunk) {
      chunkText = removeOverlapText(chunkText);
    }

    const needsSpace =
      !isFirstChunk &&
      assembledText &&
      chunkText &&
      !assembledText.endsWith(' ') &&
      !chunkText.startsWith(' ');
    if (needsSpace) {
      assembledText += ' ';
    }

    assembledText += chunkText;
  }

  const assembledResult = {
    text: assembledText.trim(),
    model_used: sortedChunks[0].result.model_used,
    processing_time: totalProcessingTime,
    language: sortedChunks[0].result.language,
  };

  if (preserveTimestamps && assembledSegments.length > 0) {
    assembledResult.segments = assembledSegments;
  }

  return assembledResult;
}

/** @param {TranscriptionResult} result */
export function formatOutput(result, format) {
  const cues = result.segments ?? [];

  switch (format) {
    case 'vtt':
      return cues.length === 0 ? `WEBVTT\n\n${result.text}` : formatVtt(cues);
    case 'srt':
      return cues.length === 0 ? result.text : formatSrt(cues);
    case 'csv':
      return formatCsv(cues);
    case 'json':
      return JSON.stringify(result, null, 2);
    default:
      return result.text;
  }
}

/** Moves segment times from chunk-relative to file-relative. */
function shiftSegments(segments, startOffset) {
  return segments.map((segment) => ({
    start: segment.start + startOffset,
    end: segment.end + startOffset,
    text: segment.text,
  }));
}

function removeOverlapSegments(newSegments, existingSegments, overlapSeconds) {
  if (existingSegments.length === 0) {
    return newSegments;
  }

  const lastExistingTime = existingSegments.at(-1).end;
  const overlapCutoffTime = lastExistingTime - overlapSeconds;

  const firstNonOverlapIndex = newSegments.findIndex(
    (segment) => segment.start >= overlapCutoffTime,
  );

  if (firstNonOverlapIndex === -1) {
    return [];
  }

  return newSegments.slice(firstNonOverlapIndex);
}

// Plain text has no timestamps, so this is a rough heuristic: drop the first few lines.
function removeOverlapText(text) {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length <= 1) {
    return text;
  }

  const linesToRemove = Math.min(2, Math.floor(lines.length * 0.1));
  return lines.slice(linesToRemove).join('\n');
}
