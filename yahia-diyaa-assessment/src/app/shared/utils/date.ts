// Builds a YYYY-MM-DD string from a Date's local calendar fields. Using
// toISOString() here would shift the date by a day for anyone west of UTC,
// since a date picked at local midnight is *yesterday* in UTC.
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
