/** YYYY-MM-DD in the device's local timezone. Session dates are stored in
 *  this form, so a workout is dated by the day the user actually trained
 *  (toISOString() would use UTC and push evening workouts to the next day). */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
