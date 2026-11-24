'use client';
import { useEffect, useRef, useState } from 'react';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'>;

interface Props extends InputProps {
  value: number;
  /** Called only with real numbers (already limited to min/max, or wrapped for angles). */
  onValue: (v: number) => void;
  min?: number;
  max?: number;
  /** Wrap into 0…wrap instead of limiting (compass angles: 370 → 10). */
  wrap?: number;
  /** Round to a whole number. */
  int?: boolean;
}

const show = (v: number) => (Number.isFinite(v) ? String(v) : '');

/**
 * Number box that can be cleared and retyped. While typing, the text is kept as entered;
 * the app only receives a value once it is a valid number. Leaving the box restores the value in use.
 */
export function NumField({ value, onValue, min, max, wrap, int, onBlur, onFocus, ...rest }: Props) {
  const [text, setText] = useState(show(value));
  const editing = useRef(false);

  // Follow outside changes (reset buttons, loading a project) when the user is not typing here.
  useEffect(() => {
    if (!editing.current) setText(show(value));
  }, [value]);

  const fix = (v: number) => {
    if (int) v = Math.round(v);
    if (wrap) v = ((v % wrap) + wrap) % wrap;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={wrap ? undefined : max}
      value={text}
      onFocus={(e) => { editing.current = true; onFocus?.(e); }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const v = parseFloat(raw);
        if (Number.isFinite(v)) onValue(fix(v));
      }}
      onBlur={(e) => {
        editing.current = false;
        const v = parseFloat(text);
        // Show the value actually used (limited / wrapped), or the last good one if the box was left empty.
        setText(show(Number.isFinite(v) ? fix(v) : value));
        onBlur?.(e);
      }}
    />
  );
}
