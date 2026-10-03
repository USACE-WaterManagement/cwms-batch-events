export const sortOfficeCodes = (offices: string[]) =>
  Array.from(new Set(offices.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
