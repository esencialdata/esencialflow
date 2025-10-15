export const getUserInitials = (fullName?: string | null, email?: string | null): string => {
  const trimmedName = fullName?.trim() ?? '';
  const trimmedEmail = email?.trim() ?? '';

  const nameTokens = trimmedName ? trimmedName.split(/\s+/).filter(Boolean) : [];

  let firstInitial: string | undefined;
  let secondInitial: string | undefined;

  if (nameTokens.length >= 1) {
    firstInitial = nameTokens[0][0];
  }
  if (nameTokens.length >= 2) {
    secondInitial = nameTokens[nameTokens.length - 1][0];
  }

  const tryPopulateFromEmail = () => {
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return;
    }
    const [localPartRaw] = trimmedEmail.split('@');
    const localPart = (localPartRaw ?? '').trim();
    if (!localPart) {
      return;
    }
    const segments = localPart.split(/[.\-_]+/).filter(Boolean);
    if (segments.length >= 2) {
      if (!firstInitial) {
        firstInitial = segments[0][0];
      }
      if (!secondInitial) {
        secondInitial = segments[segments.length - 1][0];
      }
    } else if (localPart.length >= 2) {
      if (!firstInitial) {
        firstInitial = localPart[0];
      }
      if (!secondInitial) {
        secondInitial = localPart[localPart.length - 1];
      }
    }
  };

  if (!firstInitial || !secondInitial) {
    tryPopulateFromEmail();
  }

  if (!firstInitial) {
    const fallback = nameTokens[0] ?? trimmedEmail.replace(/[^a-z0-9]/gi, '');
    if (fallback) {
      firstInitial = fallback[0];
    } else {
      firstInitial = 'U';
    }
  }

  if (!secondInitial) {
    if (nameTokens.length) {
      const joined = nameTokens.join('');
      if (joined.length >= 2) {
        secondInitial = joined[1];
      }
    }
    if (!secondInitial && trimmedEmail) {
      const alnum = trimmedEmail.replace(/[^a-z0-9]/gi, '');
      if (alnum.length >= 2) {
        secondInitial = alnum[1];
      }
    }
  }

  if (!secondInitial) {
    secondInitial = firstInitial;
  }

  return `${firstInitial}${secondInitial}`.toUpperCase();
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
