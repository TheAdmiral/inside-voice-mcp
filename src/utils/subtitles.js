/** @typedef {{ start: number, end: number, text: string }} Cue */

const pad = (number, width = 2) => String(number).padStart(width, '0');

// VTT uses "." before the milliseconds, SRT uses ",".
export function formatTimestamp(seconds, separator = '.') {
  // Work in whole milliseconds, because 3.92 % 1 * 1000 comes out as 919.99...
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)}${separator}${pad(milliseconds, 3)}`;
}

function formatCues(cues, separator) {
  return cues
    .map((cue, index) => {
      const start = formatTimestamp(cue.start, separator);
      const end = formatTimestamp(cue.end, separator);
      return `${index + 1}\n${start} --> ${end}\n${cue.text}\n\n`;
    })
    .join('');
}

/** @param {Cue[]} cues */
export function formatVtt(cues) {
  return `WEBVTT\n\n${formatCues(cues, '.')}`;
}

/** @param {Cue[]} cues */
export function formatSrt(cues) {
  return formatCues(cues, ',');
}

/**
 * Matches whisper-cli's terminal output, which is what `transcribe` returns for txt.
 * @param {Cue[]} cues
 */
export function formatTimestampedText(cues) {
  return cues
    .map((cue) => `[${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}]   ${cue.text}`)
    .join('\n');
}

/**
 * Matches whisper-cli's CSV output, with times in milliseconds.
 * @param {Cue[]} cues
 */
export function formatCsv(cues) {
  const rows = cues.map((cue) => {
    const start = Math.round(cue.start * 1000);
    const end = Math.round(cue.end * 1000);
    return `${start},${end},"${cue.text.replaceAll('"', '""')}"\n`;
  });

  return `start,end,text\n${rows.join('')}`;
}
