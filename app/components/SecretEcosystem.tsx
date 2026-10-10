"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Divider from "./Divider";
import { LogoMark } from "./Logo";

const sources = [
  ".env",
  "GitHub Actions",
  "AWS",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Vercel",
  "CI/CD",
  "Local dev",
];

const outputs = ["Applications", "CI runners", "Cloud infra"];

const accentIndex = Math.floor(sources.length / 2);

type Rect = { left: number; right: number; centerY: number };

function localRect(el: HTMLElement, containerRect: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left - containerRect.left,
    right: r.right - containerRect.left,
    centerY: r.top - containerRect.top + r.height / 2,
  };
}

function curve(x1: number, y1: number, x2: number, y2: number, bend = 0.55) {
  const midX = x1 + (x2 - x1) * bend;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

export default function SecretEcosystem() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const outputRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [sourcePaths, setSourcePaths] = useState<string[]>([]);
  const [outputPaths, setOutputPaths] = useState<string[]>([]);

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      const center = centerRef.current;
      if (!container || !center) return;

      const containerRect = container.getBoundingClientRect();
      const centerLocal = localRect(center, containerRect);

      setDims({ width: containerRect.width, height: containerRect.height });

      setSourcePaths(
        sourceRefs.current.map((el) => {
          if (!el) return "";
          const r = localRect(el, containerRect);
          return curve(r.right, r.centerY, centerLocal.left, centerLocal.centerY, 0.6);
        }),
      );

      setOutputPaths(
        outputRefs.current.map((el) => {
          if (!el) return "";
          const r = localRect(el, containerRect);
          return curve(centerLocal.right, centerLocal.centerY, r.left, r.centerY, 0.55);
        }),
      );
    }

    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <section>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-lg">
          <h2 className="whitespace-nowrap text-[32px] font-semibold tracking-tight sm:text-[40px]">
            Your secrets are everywhere.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            Scattered across files, pipelines, and providers - until there's
            one place they all point to.
          </p>
        </div>

        <div
          ref={containerRef}
          className="relative mt-16 hidden h-[380px] md:block"
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${dims.width || 1} ${dims.height || 1}`}
            fill="none"
          >
            {sourcePaths.map((d, i) => {
              const isAccent = i === accentIndex;
              return (
                <path
                  key={i}
                  d={d}
                  stroke={isAccent ? "#F2762E" : "#B0B0A8"}
                  strokeWidth="1"
                  strokeOpacity={isAccent ? 0.6 : 1}
                  strokeDasharray="4 6"
                  className={isAccent ? "animate-dash" : ""}
                />
              );
            })}
            {outputPaths.map((d, i) => (
              <path key={`out-${i}`} d={d} stroke="#B0B0A8" strokeWidth="1" />
            ))}
            {outputPaths.map((d, i) => (
              <path
                key={`out-beam-${i}`}
                d={d}
                stroke="#F2762E"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeOpacity="0.85"
                className="[stroke-dasharray:6_18] animate-dash"
                style={{ animationDelay: `${i * -1.1}s` }}
              />
            ))}
          </svg>

          <div className="absolute left-0 top-0 flex h-full flex-col justify-between py-1">
            {sources.map((s, i) => (
              <span
                key={s}
                ref={(el) => {
                  sourceRefs.current[i] = el;
                }}
                className="w-fit border border-border bg-surface px-3 py-1.5 font-mono text-[12px] text-muted"
              >
                {s}
              </span>
            ))}
          </div>

          <div
            ref={centerRef}
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          >
            <div className="flex h-24 w-24 items-center justify-center border border-accent/30 bg-accent-soft">
              <LogoMark className="h-9 w-9 text-accent" />
            </div>
            <p className="mt-4 whitespace-nowrap text-[13px] text-muted">
              One source of truth.
            </p>
          </div>

          <div className="absolute right-0 top-0 flex h-full flex-col justify-between py-1">
            {outputs.map((label, i) => (
              <span
                key={label}
                ref={(el) => {
                  outputRefs.current[i] = el;
                }}
                className="flex w-fit items-center gap-2 whitespace-nowrap border border-border bg-surface px-3 py-1.5 font-mono text-[12px] text-muted"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-2 md:hidden">
          {sources.map((s) => (
            <span
              key={s}
              className="border border-border bg-surface px-3 py-1.5 font-mono text-[12px] text-muted"
            >
              {s}
            </span>
          ))}
          <div className="mt-6 w-full">
            <div className="flex items-center gap-3 border border-accent/30 bg-accent-soft px-4 py-3">
              <LogoMark className="h-5 w-5 text-accent" />
              <span className="text-[12px] text-muted">
                one source of truth
              </span>
            </div>
          </div>
          <div className="mt-2 flex w-full flex-wrap gap-2">
            {outputs.map((o) => (
              <span
                key={o}
                className="flex items-center gap-2 border border-border bg-surface px-3 py-1.5 font-mono text-[12px] text-muted"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                {o}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
