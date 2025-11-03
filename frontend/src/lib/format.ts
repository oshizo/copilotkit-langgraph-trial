export function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}
