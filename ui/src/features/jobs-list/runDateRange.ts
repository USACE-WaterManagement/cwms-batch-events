export interface RunDateRange { start: string; end: string }

export function dateParams(range: RunDateRange): URLSearchParams {
  const params = new URLSearchParams();
  if (range.start) params.set("submittedFrom", new Date(`${range.start}T00:00:00`).toISOString());
  if (range.end) {
    const end = new Date(`${range.end}T00:00:00`);
    end.setDate(end.getDate() + 1);
    params.set("submittedBefore", end.toISOString());
  }
  return params;
}

