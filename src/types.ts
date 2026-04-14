export interface TextLayer {
  id: string;
  text: string;
  /** Center X, normalized 0–1 over the image */
  nx: number;
  /** Center Y, normalized 0–1 over the image */
  ny: number;
  /** Font size as a fraction of image height (export) */
  sizeRatio: number;
  /** First font family name (matches loaded web fonts) */
  fontFamily: string;
  fontWeight: 400 | 700;
  fontStyle: 'normal' | 'italic';
  color: string;
}

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'DM Sans', value: 'DM Sans' },
  { label: 'Noto Sans', value: 'Noto Sans' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Oswald', value: 'Oswald' },
  { label: 'Merriweather', value: 'Merriweather' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Fraunces', value: 'Fraunces' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Pacifico', value: 'Pacifico' },
  { label: 'Anton', value: 'Anton' },
];
