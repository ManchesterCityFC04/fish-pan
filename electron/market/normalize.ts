// Pure normalization helpers for news data. No network, no Date.now() inside any helper.

/** Strip HTML tags and decode a small set of common entities. */
export function stripHtml(input: unknown): string {
  const raw = String(input ?? '');
  // Remove tags.
  const noTags = raw.replace(/<[^>]*>/g, '');
  // Decode common named + numeric entities.
  const named: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&hellip;': '…',
    '&mdash;': '—',
    '&ndash;': '–',
  };
  let out = noTags;
  for (const k of Object.keys(named)) {
    out = out.split(k).join(named[k]);
  }
  // Numeric entities &#1234;
  out = out.replace(/&#(\d+);/g, (_m, dec) => {
    const code = Number(dec);
    if (!Number.isFinite(code)) return _m;
    try {
      return String.fromCharCode(code);
    } catch {
      return _m;
    }
  });
  // Hex entities &#x1F600;
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
    const code = parseInt(hex, 16);
    if (!Number.isFinite(code)) return _m;
    try {
      return String.fromCharCode(code);
    } catch {
      return _m;
    }
  });
  // Collapse whitespace.
  return out.replace(/\s+/g, ' ').trim();
}

/** Normalize a raw stock code to the canonical `sh/sz/bj/hk` form. Pure. */
export function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  // Already prefixed? Pass through.
  if (/^(sh|sz|bj|hk)(\d{4,6})$/.test(s)) return s;
  // Numeric form.
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith('6')) return 'sh' + s;
    if (s.startsWith('0') || s.startsWith('3')) return 'sz' + s;
    if (s.startsWith('8') || s.startsWith('4')) return 'bj' + s;
    return 'sh' + s;
  }
  if (/^\d{4,5}$/.test(s)) return 'hk' + s.padStart(5, '0');
  return s;
}

/** Truncate a string to `max` code points and append an ellipsis when trimmed. */
export function truncateSummary(input: unknown, max = 200): string {
  const s = stripHtml(input);
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/[\s,.;:!?，。；：！？]+$/u, '') + '…';
}

/** FNV-1a 32-bit, returns 8-char hex. Stable per process. */
export function hashTitle(input: unknown): string {
  const s = String(input ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Stable id for a news item. */
export function makeNewsId(kind: string, vendorId: string, rawIdOrUrl: string): string {
  return `${kind}:${vendorId}:${hashTitle(rawIdOrUrl)}`;
}

/** True when url uses http(s); rejects javascript:, data:, file: etc. */
export function isSafeUrl(url: unknown): url is string {
  const s = String(url ?? '');
  return /^https?:\/\//i.test(s);
}