"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Divider from "./Divider";
import { LogoMark } from "./Logo";

type Node = { id: string; label: string; x: number; y: number };

const initialNodes: Node[] = [
  { id: "developers", label: "Developers", x: 15, y: 18 },
  { id: "cicd", label: "CI/CD", x: 85, y: 18 },
  { id: "applications", label: "Applications", x: 8, y: 75 },
  { id: "infrastructure", label: "Infrastructure", x: 92, y: 75 },
  { id: "cloud", label: "Cloud", x: 50, y: 92 },
];

const initialCenter: Node = { id: "center", label: "KEEL", x: 50, y: 50 };

export default function ArchitectureDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingId = useRef<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [center, setCenter] = useState<Node>(initialCenter);

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !draggingId.current) return;
    const x = Math.min(
      96,
      Math.max(4, ((clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.min(
      96,
      Math.max(4, ((clientY - rect.top) / rect.height) * 100),
    );

    if (draggingId.current === "center") {
      setCenter((c) => ({ ...c, x, y }));
    } else {
      const id = draggingId.current;
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
    }
  }, []);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!draggingId.current) return;
      updatePosition(e.clientX, e.clientY);
    };
    const handleUp = () => {
      draggingId.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [updatePosition]);

  return (
    <section>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-lg">
          <h2 className="text-balance text-[32px] font-semibold tracking-tight sm:text-[40px]">
            One layer, every consumer.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            A single centralized system for secrets - read by developers,
            pipelines, and infrastructure alike.
          </p>
        </div>

        <div
          ref={containerRef}
          className="relative mx-auto mt-16 hidden aspect-[16/11] max-w-3xl select-none md:block"
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 68"
            preserveAspectRatio="none"
          >
            {nodes.map((n) => (
              <line
                key={n.id}
                x1={n.x}
                y1={n.y * (68 / 100)}
                x2={center.x}
                y2={center.y * (68 / 100)}
                stroke="#E5E5E0"
                strokeWidth="0.3"
              />
            ))}
          </svg>

          {nodes.map((n) => (
            <div
              key={n.id}
              onPointerDown={(e) => {
                e.preventDefault();
                draggingId.current = n.id;
              }}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center gap-2 border border-border bg-surface px-3 py-1.5 shadow-sm transition-shadow active:cursor-grabbing active:shadow-md"
              style={{ left: `${n.x}%`, top: `${n.y}%`, touchAction: "none" }}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
              <span className="whitespace-nowrap font-mono text-[12px] text-muted">
                {n.label}
              </span>
            </div>
          ))}

          <div
            onPointerDown={(e) => {
              e.preventDefault();
              draggingId.current = "center";
            }}
            className="absolute flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center justify-center border border-accent/30 bg-accent-soft transition-shadow active:cursor-grabbing"
            style={{
              left: `${center.x}%`,
              top: `${center.y}%`,
              boxShadow: "0 20px 50px rgba(242,118,46,0.15)",
              touchAction: "none",
            }}
          >
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
            <LogoMark className="mt-2 h-6 w-6 text-accent" />
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-2 md:hidden">
          {initialNodes.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 border border-border bg-surface px-3 py-2"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
              <span className="font-mono text-[12px] text-muted">
                {n.label}
              </span>
            </div>
          ))}
          <div className="col-span-2 mt-2 flex items-center justify-center gap-2 border border-accent/30 bg-accent-soft px-4 py-3">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <LogoMark className="h-5 w-5 text-accent" />
          </div>
        </div>
      </div>
    </section>
  );
}
