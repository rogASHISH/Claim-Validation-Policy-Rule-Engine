export const getValueByPath = (source: unknown, path: string): unknown => {
  if (!path) {
    return undefined;
  }

  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  return normalizedPath.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
};
