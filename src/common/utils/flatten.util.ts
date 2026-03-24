export type FlatRecord = Record<string, unknown>;

export const flattenObject = (
  value: unknown,
  prefix = '',
  target: FlatRecord = {}
): FlatRecord => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenObject(item, nextPrefix, target);
    });
    return target;
  }

  if (value !== null && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenObject(nestedValue, nextPrefix, target);
    });
    return target;
  }

  if (prefix) {
    target[prefix] = value;
  }

  return target;
};
