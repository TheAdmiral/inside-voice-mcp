const pad = (number, width = 2) => String(number).padStart(width, '0');

// VTT uses "." before the milliseconds, SRT uses ",".
export function formatTimestamp(seconds, separator = '.') {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

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

/** @param {{ start: number, end: number, text: string }[]} cues */
export function formatVtt(cues) {
  return `WEBVTT\n\n${formatCues(cues, '.')}`;
}

/** @param {{ start: number, end: number, text: string }[]} cues */
export function formatSrt(cues) {
  return formatCues(cues, ',');
}
