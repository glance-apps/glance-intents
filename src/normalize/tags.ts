// `#word` only matches when preceded by whitespace or start-of-string, so
// fragments inside URLs (e.g. `https://example.com/#anchor`) are not
// extracted as tags.
const INLINE_TAG_RE = /(^|\s)#([a-zA-Z0-9_-]+)/g;

export interface NormalizeTagsInput {
  title?: string;
  tags?: string;
}

export interface NormalizeTagsOutput {
  title: string;
  tags: string[];
}

export function normalizeTags(input: NormalizeTagsInput): NormalizeTagsOutput {
  const rawTitle = input.title ?? '';
  const rawTags = input.tags ?? '';

  const inlineTags: string[] = [];
  for (const match of rawTitle.matchAll(INLINE_TAG_RE)) {
    const tag = match[2];
    if (tag !== undefined) inlineTags.push(tag);
  }

  const cleanedTitle = rawTitle
    .replace(INLINE_TAG_RE, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  const explicitTags = rawTags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => (t.startsWith('#') ? t.slice(1) : t));

  const allTags = [...inlineTags, ...explicitTags].map((t) => t.toLowerCase());

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const tag of allTags) {
    if (!seen.has(tag)) {
      seen.add(tag);
      deduped.push(tag);
    }
  }

  return { title: cleanedTitle, tags: deduped };
}
