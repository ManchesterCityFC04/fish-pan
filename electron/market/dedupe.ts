// Deduplicate news items by `(url | hashTitle(title))`. Pure.

import type { NewsItem } from './types';
import { hashTitle } from './normalize';

export interface DedupeResult {
  items: NewsItem[];
  /** Number of records dropped due to missing url or non-finite publishedAt. */
  dropped: number;
}

export function dedupeNews(items: ReadonlyArray<NewsItem>): DedupeResult {
  const byKey = new Map<string, NewsItem>();
  let dropped = 0;
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      dropped++;
      continue;
    }
    if (!it.url || !Number.isFinite(it.publishedAt)) {
      dropped++;
      continue;
    }
    const key = it.url ? `u:${it.url}` : `t:${hashTitle(it.title)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, it);
      continue;
    }
    // Keep the record with the most recent publishedAt.
    if (it.publishedAt > existing.publishedAt) {
      byKey.set(key, it);
    }
  }
  // Stable order: most-recent first.
  const result = Array.from(byKey.values()).sort((a, b) => b.publishedAt - a.publishedAt);
  return { items: result, dropped };
}