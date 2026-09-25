export interface ColorChannels {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface ColorFormats {
  hex: string;
  hexa: string;
  rgb: string;
  rgba: string;
  hsl: string;
  hsla: string;
  hsv: string;
  cmyk: string;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const parseCssColor = (input: string): ColorChannels | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const probe = document.createElement('span');
  probe.style.color = trimmed;
  if (!probe.style.color) return null;

  probe.style.display = 'none';
  document.body.appendChild(probe);
  const values = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();

  if (!values || values.length < 3) return null;

  const red = clamp(Math.round(Number(values[0])), 0, 255);
  const green = clamp(Math.round(Number(values[1])), 0, 255);
  const blue = clamp(Math.round(Number(values[2])), 0, 255);
  const alpha = values[3] === undefined ? 1 : clamp(Number(values[3]), 0, 1);
  return [red, green, blue, alpha].some(Number.isNaN) ? null : { red, green, blue, alpha };
};

const toHex = (value: number): string => value.toString(16).padStart(2, '0').toUpperCase();

const hue = (red: number, green: number, blue: number, max: number, delta: number): number => {
  if (delta === 0) return 0;
  const value = max === red
    ? ((green - blue) / delta) % 6
    : max === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return Math.round((value * 60 + 360) % 360);
};

const rgbToHsl = (red: number, green: number, blue: number): { h: number; s: number; l: number } => {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  return {
    h: hue(r, g, b, max, delta),
    s: Math.round((delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))) * 100),
    l: Math.round(lightness * 100),
  };
};

const rgbToHsv = (red: number, green: number, blue: number): { h: number; s: number; v: number } => {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  return {
    h: hue(r, g, b, max, delta),
    s: Math.round((max === 0 ? 0 : delta / max) * 100),
    v: Math.round(max * 100),
  };
};

const rgbToCmyk = (red: number, green: number, blue: number): { c: number; m: number; y: number; k: number } => {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const key = 1 - Math.max(r, g, b);
  if (key === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - r - key) / (1 - key)) * 100),
    m: Math.round(((1 - g - key) / (1 - key)) * 100),
    y: Math.round(((1 - b - key) / (1 - key)) * 100),
    k: Math.round(key * 100),
  };
};

export const toColorFormats = ({ red, green, blue, alpha }: ColorChannels): ColorFormats => {
  const hsl = rgbToHsl(red, green, blue);
  const hsv = rgbToHsv(red, green, blue);
  const cmyk = rgbToCmyk(red, green, blue);
  const alphaString = String(Math.round(alpha * 1000) / 1000);
  return {
    hex: `#${toHex(red)}${toHex(green)}${toHex(blue)}`,
    hexa: `#${toHex(red)}${toHex(green)}${toHex(blue)}${toHex(Math.round(alpha * 255))}`,
    rgb: `rgb(${red}, ${green}, ${blue})`,
    rgba: `rgba(${red}, ${green}, ${blue}, ${alphaString})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    hsla: `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alphaString})`,
    hsv: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
    cmyk: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
  };
};
