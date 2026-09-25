import { useCallback, useMemo, useState } from 'react';
import { parseCssColor, toColorFormats } from '../color';

const emptyFormats = ['HEX', 'HEXA', 'RGB', 'RGBA', 'HSL', 'HSLA', 'HSV', 'CMYK'].map((label) => ({ label, value: '—' }));

export default function ColorPage() {
  const [inputColor, setInputColor] = useState('');
  const [copiedFormat, setCopiedFormat] = useState('');
  const channels = useMemo(() => parseCssColor(inputColor), [inputColor]);
  const formats = useMemo(() => channels ? toColorFormats(channels) : null, [channels]);
  const rows = formats ? [
    { label: 'HEX', value: formats.hex },
    { label: 'HEXA', value: formats.hexa },
    { label: 'RGB', value: formats.rgb },
    { label: 'RGBA', value: formats.rgba },
    { label: 'HSL', value: formats.hsl },
    { label: 'HSLA', value: formats.hsla },
    { label: 'HSV', value: formats.hsv },
    { label: 'CMYK', value: formats.cmyk },
  ] : emptyFormats;

  const copy = useCallback(async (label: string, value: string) => {
    if (value === '—') return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedFormat(label);
      window.setTimeout(() => setCopiedFormat(''), 1200);
    } catch {
      setCopiedFormat('');
    }
  }, []);

  const textColor = channels && (channels.red * 0.299 + channels.green * 0.587 + channels.blue * 0.114) / 255 > 0.55 ? '#151515' : '#f5f5f5';
  const status = copiedFormat
    ? `${copiedFormat} COPIED`
    : inputColor.trim() && !formats ? 'INVALID CSS COLOR' : '';

  return (
    <section className="color-page" aria-label="Color converter">
      <div className="color-entry">
        <input type="text" className="color-input" value={inputColor} onChange={(event) => { setInputColor(event.target.value); setCopiedFormat(''); }} placeholder="#6366f1" aria-label="CSS color" aria-invalid={Boolean(inputColor.trim() && !formats)} aria-describedby="color-status" autoFocus />
        <span id="color-status" className={`context-status ${inputColor.trim() && !formats ? 'is-error' : ''}`} role="status" aria-live="polite" aria-atomic="true">{status}</span>
      </div>
      <div className="color-table">
        <div className="color-preview-row">
          <span className="format-label">PREVIEW</span>
          <span className="color-swatch" style={{ backgroundColor: formats?.rgba ?? 'transparent', color: formats ? textColor : 'var(--muted)' }}>{formats?.hex ?? 'NO COLOR'}</span>
        </div>
        {rows.map((row) => (
          <button key={row.label} type="button" className="format-row" onClick={() => copy(row.label, row.value)} disabled={row.value === '—'}>
            <span className="format-label">{row.label}</span>
            <span className="format-dots" aria-hidden="true" />
            <span className="format-value">{row.value}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
