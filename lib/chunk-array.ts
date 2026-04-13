export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize < 1) throw new Error("chunkSize must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}
