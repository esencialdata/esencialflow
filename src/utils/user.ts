export const getUserInitials = (fullNameOrEmail: string): string => {
  const source = fullNameOrEmail?.trim();
  if (!source) {
    return 'US';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstInitial = parts[0][0];
    const lastInitial = parts[parts.length - 1][0];
    return `${firstInitial}${lastInitial}`.toUpperCase();
  }

  const single = parts[0];
  if (single.includes('@')) {
    const [beforeAtRaw] = single.split('@');
    const beforeAt = beforeAtRaw.trim();
    if (beforeAt) {
      const tokens = beforeAt.split(/[.\-_]+/).filter(Boolean);
      if (tokens.length >= 2) {
        return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
      }
      if (beforeAt.length >= 2) {
        return `${beforeAt[0]}${beforeAt[beforeAt.length - 1]}`.toUpperCase();
      }
    }
  }

  return single.slice(0, 2).toUpperCase();
};

export const generateColorFromId = (id: string): string => {
  if (!id) {
    return '#475569';
  }

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  const saturation = 70;
  const lightness = 45;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};
