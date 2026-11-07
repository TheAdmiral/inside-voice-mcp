import { formatSrt, formatVtt } from './subtitles.js';

const UNKNOWN_SPEAKER = 'speaker_unknown';
const MIN_OVERLAP_SECONDS = 0.1;
const MIN_CONFIDENCE = 0.1;
const MERGE_GAP_SECONDS = 1;

/**
 * @typedef {{ start: number, end: number, speaker: string }} DiarizationSegment
 * @typedef {{ text: string, speaker: string, start: number, end: number,
 *   confidence: number }} SpeakerSegment
 */

/**
 * Gives each transcription segment the speaker whose diarization segment overlaps it most.
 * @param {import('../whisper.js').TranscriptionResult} transcription
 * @param {DiarizationSegment[]} diarization
 * @returns {SpeakerSegment[]}
 */
export function alignTranscriptionWithSpeakers(transcription, diarization) {
  const transcriptionSegments = getSegmentsToAlign(transcription, diarization);
  const aligned = transcriptionSegments.map((segment) => assignSpeaker(segment, diarization));

  return mergeNeighbours(aligned);
}

function getSegmentsToAlign(transcription, diarization) {
  if (transcription.segments?.length) {
    return transcription.segments;
  }

  // No segment times to go on, so cover the whole diarization, and at least 20 seconds.
  const diarizationEnd = Math.max(...diarization.map((segment) => segment.end));
  return [{ start: 0, end: Math.max(20, diarizationEnd), text: transcription.text }];
}

/** A segment with no good speaker match stays in the output, so its text is never lost. */
function assignSpeaker(transcriptionSegment, diarization) {
  const { text, start, end } = transcriptionSegment;
  const { bestMatch, maxOverlap } = findBestSpeaker(transcriptionSegment, diarization);
  const confidence = maxOverlap / (end - start);

  const isGoodMatch = maxOverlap > MIN_OVERLAP_SECONDS && confidence >= MIN_CONFIDENCE;
  if (!isGoodMatch) {
    return { text, speaker: UNKNOWN_SPEAKER, start, end, confidence: 0 };
  }

  return { text, speaker: normalizeSpeakerLabel(bestMatch.speaker), start, end, confidence };
}

function findBestSpeaker(transcriptionSegment, diarization) {
  let bestMatch = null;
  let maxOverlap = 0;

  for (const diarizationSegment of diarization) {
    const overlap = calculateOverlap(transcriptionSegment, diarizationSegment);
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestMatch = diarizationSegment;
    }
  }

  return { bestMatch, maxOverlap };
}

/** @param {SpeakerSegment[]} segments */
export function formatSpeakerSegments(segments, format) {
  switch (format) {
    case 'vtt':
      return formatVtt(
        segments.map((segment) => ({
          ...segment,
          text: `<v ${segment.speaker}>${segment.text}</v>`,
        })),
      );
    case 'srt':
      return formatSrt(
        segments.map((segment) => ({ ...segment, text: `[${segment.speaker}]: ${segment.text}` })),
      );
    case 'json':
      return JSON.stringify(segments, null, 2);
    default:
      return segments.map((segment) => `[${segment.speaker}]: ${segment.text}`).join('\n');
  }
}

function calculateOverlap(first, second) {
  const overlapStart = Math.max(first.start, second.start);
  const overlapEnd = Math.min(first.end, second.end);
  return Math.max(0, overlapEnd - overlapStart);
}

// Turns labels such as "SPEAKER_00" into "speaker00".
function normalizeSpeakerLabel(label) {
  const match = label.match(/(\d+)/);
  if (!match) {
    return label.toLowerCase();
  }

  const speakerNumber = String(Number(match[1]));
  return `speaker${speakerNumber.padStart(2, '0')}`;
}

// Merges consecutive segments from the same speaker that are less than MERGE_GAP_SECONDS apart.
function mergeNeighbours(segments) {
  const merged = [];
  let current = null;

  for (const segment of segments) {
    const canMerge =
      current &&
      current.speaker === segment.speaker &&
      segment.start - current.end < MERGE_GAP_SECONDS;

    if (canMerge) {
      current.text += ' ' + segment.text;
      current.end = segment.end;
      current.confidence = Math.min(current.confidence, segment.confidence);
    } else {
      if (current) {
        merged.push(current);
      }
      current = { ...segment };
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}
