"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ01#$%&*+-/=";
const TICK_MS = 45;

type Unit = { char: string; start: number; end: number };

export default function EncryptedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(text);
  const tickRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unitsRef = useRef<Unit[]>([]);

  const clear = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const tick = useCallback(() => {
    const units = unitsRef.current;
    let output = "";
    let done = 0;
    for (const u of units) {
      if (tickRef.current >= u.end) {
        done++;
        output += u.char;
      } else if (tickRef.current >= u.start && u.char !== " ") {
        output += CHARS[Math.floor(Math.random() * CHARS.length)];
      } else {
        output += u.char;
      }
    }
    setDisplay(output);
    tickRef.current++;
    if (done >= units.length) {
      clear();
    }
  }, []);

  const start = useCallback(() => {
    clear();
    tickRef.current = 0;
    unitsRef.current = text.split("").map((char, i) => {
      const start = Math.floor(i * 0.15) + Math.floor(Math.random() * 2);
      return {
        char,
        start,
        end: start + Math.floor(Math.random() * 5) + 6,
      };
    });
    timerRef.current = setInterval(tick, TICK_MS);
  }, [text, tick]);

  const stop = useCallback(() => {
    clear();
    setDisplay(text);
  }, [text]);

  useEffect(() => stop, [stop]);

  return (
    <span
      onMouseEnter={start}
      onMouseLeave={stop}
      className={`inline-block whitespace-nowrap font-mono ${className ?? ""}`}
      style={{ width: `${text.length}ch` }}
    >
      {display}
    </span>
  );
}
