/** True when every word of the query appears somewhere in the text, ignoring case. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const text = haystack.toLowerCase();
  return words.every((word) => text.includes(word));
}
