export function cn(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(' ');
}
