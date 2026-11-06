export function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

export function jsonResult(data) {
  return textResult(JSON.stringify(data, null, 2));
}
