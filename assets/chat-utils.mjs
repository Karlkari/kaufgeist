export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
export function formatReply(value) {
  // Formatting only; no model-controlled HTML or URL insertion.
  return escapeHtml(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}
export function safeAmazonUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'www.amazon.de' && !url.username && !url.password && url.pathname === '/s' && url.searchParams.has('k')) return url.href;
  } catch {}
  return null;
}
export function compactHistory(history) {
  const result = [];
  let length = 0;
  for (const message of [...history].reverse()) {
    const content = String(message.content || '').slice(0, message.role === 'user' ? 1500 : 4000);
    if (result.length === 12 || length + content.length > 12000) break;
    result.unshift({ role: message.role, content });
    length += content.length;
  }
  while (result[0]?.role === 'assistant') result.shift();
  return result;
}
export function validSource(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url : null; } catch { return null; }
}
