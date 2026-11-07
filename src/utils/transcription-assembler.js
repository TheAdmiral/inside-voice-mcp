import { formatCsv, formatSrt, formatTimestampedText, formatVtt } from './subtitles.js';

/**
 * @typedef {import('../whisper.js').TranscriptionResult} TranscriptionResult
 * @typedef {import('../whisper.js').Segment} Segment
 * @typedef {{ chunkIndex: number, startOffset: number,
 *   result: TranscriptionResult }} ChunkTranscription
 */

/**
 * Joins the transcriptions of overlapping audio chunks into one transcription.
 * @param {ChunkTranscription[]} chunks `startOffset` is in seconds.
 * @param {{ overlapSeconds?: number }} options
 * @returns {TranscriptionResult}
 */
export function assembleTranscriptions(chunks, options = {}) {
  const { overlapSeconds = 30 } = options;

  if (chunks.length === 0) {
    return { text: '', model_used: 'base.en', processing_time: 0 };
  }

  if (chunks.length === 1) {
    return chunks[0].result;
  }

  const sortedChunks = chunks.toSorted((a, b) => a.chunkIndex - b.chunkIndex);

  const assembledSegments = [];
  let totalProcessingTime = 0;

  for (const [index, chunk] of sortedChunks.entries()) {
    totalProcessingTime += chunk.result.processing_time;

    if (!chunk.result.segments) {
      continue;
    }

    const shiftedSegments = shiftSegments(chunk.result.segments, chunk.startOffset);

    if (index === 0) {
      assembledSegments.push(...shiftedSegments);
    } else {
      const cutoffTime = chunk.startOffset + overlapSeconds / 2;
      joinAtOverlapMidpoint(assembledSegments, shiftedSegments, cutoffTime);
    }
  }

  const assembledResult = {
    text: joinText(sortedChunks, assembledSegments),
    model_used: sortedChunks[0].result.model_used,
    processing_time: totalProcessingTime,
    language: sortedChunks[0].result.language,
  };

  if (assembledSegments.length > 0) {
    assembledResult.segments = assembledSegments;
  }

  return assembledResult;
}

/** Segments have had their overlap removed, so they are preferred to the chunks' own text. */
function joinText(sortedChunks, assembledSegments) {
  if (assembledSegments.length > 0) {
    return assembledSegments.map((segment) => segment.text).join(' ');
  }

  const chunkTexts = sortedChunks.map((chunk) => chunk.result.text.trim());
  return chunkTexts.filter((text) => text !== '').join(' ');
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
      return cues.length === 0 ? result.text : formatTimestampedText(cues);
  }
}

/** Moves segment times from chunk-relative to file-relative. */
function shiftSegments(segments, startOffset) {
  return segments.map((segment) => {
    const shiftedSegment = shiftTimes(segment, startOffset);

    if (segment.words) {
      shiftedSegment.words = segment.words.map((word) => shiftTimes(word, startOffset));
    }

    return shiftedSegment;
  });
}

function shiftTimes(item, startOffset) {
  return {
    ...item,
    start: item.start + startOffset,
    end: item.end + startOffset,
  };
}

/**
 * Both chunks cover the overlap, so one copy of it has to go. Cutting at the midpoint keeps
 * each chunk's audio away from its cut-off edge, where whisper is least reliable.
 */
function joinAtOverlapMidpoint(assembledSegments, newSegments, cutoffTime) {
  while (assembledSegments.length > 0 && assembledSegments.at(-1).start >= cutoffTime) {
    assembledSegments.pop();
  }

  const keptSegments = newSegments.filter((segment) => segment.start >= cutoffTime);

  // The chunks can disagree slightly on timing, and cues must not overlap.
  const lastSegment = assembledSegments.at(-1);
  if (lastSegment && keptSegments.length > 0) {
    const nextStart = keptSegments[0].start;
    lastSegment.end = Math.min(lastSegment.end, nextStart);
    for (const word of lastSegment.words ?? []) {
      word.start = Math.min(word.start, nextStart);
      word.end = Math.min(word.end, nextStart);
    }
  }

  assembledSegments.push(...keptSegments);
}
