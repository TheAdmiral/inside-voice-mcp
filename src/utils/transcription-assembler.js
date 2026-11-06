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
        joinAtOverlapMidpoint(
          assembledSegments,
          shiftedSegments,
          chunk.startOffset + overlapSeconds / 2,
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

  // Segments have had their overlap removed exactly, so prefer them to the text heuristic.
  const hasSegments = preserveTimestamps && assembledSegments.length > 0;

  const assembledResult = {
    text: hasSegments
      ? assembledSegments.map((segment) => segment.text).join(' ')
      : assembledText.trim(),
    model_used: sortedChunks[0].result.model_used,
    processing_time: totalProcessingTime,
    language: sortedChunks[0].result.language,
  };

  if (hasSegments) {
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

/**
 * Both chunks cover the overlap, so one copy of it has to go. Cutting at the midpoint keeps
 * each chunk's audio away from its cut-off edge, where whisper is least reliable.
 */
function joinAtOverlapMidpoint(assembledSegments, newSegments, cutoffTime) {
  while (assembledSegments.at(-1)?.start >= cutoffTime) {
    assembledSegments.pop();
  }

  const keptSegments = newSegments.filter((segment) => segment.start >= cutoffTime);

  // The chunks can disagree slightly on timing, and cues must not overlap.
  const lastSegment = assembledSegments.at(-1);
  if (lastSegment && keptSegments.length > 0) {
    lastSegment.end = Math.min(lastSegment.end, keptSegments[0].start);
  }

  assembledSegments.push(...keptSegments);
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
