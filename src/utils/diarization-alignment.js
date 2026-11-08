import { formatSrt, formatVtt } from './subtitles.js';

const UNKNOWN_SPEAKER = 'speaker_unknown';
const MIN_OVERLAP_SECONDS = 0.1;
const MIN_CONFIDENCE = 0.1;
const MERGE_GAP_SECONDS = 1;

/**
 * @typedef {{ start: number, end: number, speaker: string }} DiarizationSegment
 * @typedef {{ text: string, speaker: string, start: number, end: number, confidence: number,
 *   words?: import('../whisper.js').Word[] }} SpeakerSegment
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
  const { text, start, end, words } = transcriptionSegment;
  const { bestMatch, maxOverlap } = findBestSpeaker(transcriptionSegment, diarization);
  const confidence = maxOverlap / (end - start);

  const isGoodMatch = maxOverlap > MIN_OVERLAP_SECONDS && confidence >= MIN_CONFIDENCE;
  const aligned = isGoodMatch
    ? { text, speaker: normalizeSpeakerLabel(bestMatch.speaker), start, end, confidence }
    : { text, speaker: UNKNOWN_SPEAKER, start, end, confidence: 0 };

  if (words) {
    aligned.words = words;
  }

  return aligned;
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

/** Follows whisper-cli's CSV output, with times in milliseconds, and adds the speaker. */
function formatSpeakerCsv(segments) {
  const rows = segments.map((segment) => {
    const start = Math.round(segment.start * 1000);
    const end = Math.round(segment.end * 1000);
    return `${start},${end},${segment.speaker},"${segment.text.replaceAll('"', '""')}"\n`;
  });

  return `start,end,speaker,text\n${rows.join('')}`;
}

/**
 * Text for `json` is the same as for `txt`, because JSON callers get the segments in metadata.
 * @param {SpeakerSegment[]} segments
 */
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
    case 'csv':
      return formatSpeakerCsv(segments);
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
      if (segment.words) {
        current.words = [...(current.words ?? []), ...segment.words];
      }
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
