import { formatSrt, formatVtt } from './subtitles.js';

/**
 * @typedef {{ start: number, end: number, speaker: string }} DiarizationSegment
 * @typedef {{ text: string, speaker: string, start: number, end: number,
 *   confidence: number }} SpeakerSegment
 */

/**
 * Gives each transcription segment the speaker whose diarization segment overlaps it most.
 * @param {import('../whisper/integration.js').TranscriptionResult} transcription
 * @param {DiarizationSegment[]} diarization
 * @returns {SpeakerSegment[]}
 */
export function alignTranscriptionWithSpeakers(transcription, diarization, options = {}) {
  const { overlapThreshold = 0.1, mergeThreshold = 1.0, confidenceThreshold = 0.1 } = options;

  const transcriptionSegments = transcription.segments?.length
    ? transcription.segments
    : [
        {
          start: 0,
          // Cover the whole diarization, and at least 20 seconds.
          end: Math.max(20, ...diarization.map((segment) => segment.end)),
          text: transcription.text,
        },
      ];

  const aligned = [];

  for (const transcriptionSegment of transcriptionSegments) {
    let bestMatch = null;
    let maxOverlap = 0;

    for (const diarizationSegment of diarization) {
      const overlap = calculateOverlap(transcriptionSegment, diarizationSegment);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = diarizationSegment;
      }
    }

    if (bestMatch && maxOverlap > overlapThreshold) {
      const confidence = maxOverlap / (transcriptionSegment.end - transcriptionSegment.start);

      if (confidence >= confidenceThreshold) {
        aligned.push({
          text: transcriptionSegment.text,
          speaker: normalizeSpeakerLabel(bestMatch.speaker),
          start: transcriptionSegment.start,
          end: transcriptionSegment.end,
          confidence,
        });
      }
    } else {
      aligned.push({
        text: transcriptionSegment.text,
        speaker: 'speaker_unknown',
        start: transcriptionSegment.start,
        end: transcriptionSegment.end,
        confidence: 0,
      });
    }
  }

  return mergeNeighbours(aligned, mergeThreshold);
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
  if (match) {
    return `speaker${String(parseInt(match[1], 10)).padStart(2, '0')}`;
  }

  // No number in the label, so derive a stable one from a hash of the label.
  const number = (hashString(label) % 10) + 1;
  return `speaker${String(number).padStart(2, '0')}`;
}

function hashString(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash = hash & hash; // Keep it a 32-bit integer.
  }
  return Math.abs(hash);
}

// Merges consecutive segments from the same speaker that are less than mergeThreshold apart.
function mergeNeighbours(segments, mergeThreshold) {
  const merged = [];
  let current = null;

  for (const segment of segments) {
    const canMerge =
      current &&
      current.speaker === segment.speaker &&
      segment.start - current.end < mergeThreshold;

    if (canMerge) {
      current.text += ' ' + segment.text;
      current.end = segment.end;
      current.confidence = Math.min(current.confidence, segment.confidence);
    } else {
      if (current) merged.push(current);
      current = { ...segment };
    }
  }

  if (current) merged.push(current);

  return merged;
}
