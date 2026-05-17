import { useState, useEffect, useRef } from 'react';
import { Text, TextStyle } from 'react-native';

interface Props {
  value: number;
  formatter: (v: number) => string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}

/**
 * Renders a number that smoothly counts from its previous value to the new one.
 * Uses ease-out quadratic over ~400ms. Only the displayed number animates —
 * the surrounding layout stays completely stable.
 */
export function AnimatedBalance({ value, formatter, style, numberOfLines }: Props) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    prevRef.current = to;

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const STEPS = 24;
    const STEP_MS = 400 / STEPS;
    let step = 0;

    timerRef.current = setInterval(() => {
      step++;
      const t = step / STEPS;
      const eased = t * (2 - t); // ease-out quadratic
      setDisplayed(from + (to - from) * eased);
      if (step >= STEPS) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setDisplayed(to);
      }
    }, STEP_MS);

    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [value]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {formatter(displayed)}
    </Text>
  );
}
