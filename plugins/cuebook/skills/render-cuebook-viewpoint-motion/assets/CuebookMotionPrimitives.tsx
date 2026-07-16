import * as React from "react";
import {motion, useInView, useReducedMotion} from "motion/react";

declare global {
  interface Window {
    __cuebookReady?: boolean;
    __cuebookSetTime?: (timeMs: number) => void;
  }
}

export type CuebookClock = {
  timeMs: number;
  progress: number;
  reducedMotion: boolean;
  complete: boolean;
};

export type CuebookMotionRootProps = {
  durationMs: number;
  externalTimeMs?: number;
  autoplay?: boolean;
  reducedMotion?: boolean;
  exposeExternalControl?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: (clock: CuebookClock) => React.ReactNode;
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function expoOut(value: number): number {
  const t = clamp01(value);
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function easeInOut(value: number): number {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function beatProgress(
  timeMs: number,
  startMs: number,
  endMs: number,
  easing: (value: number) => number = expoOut,
): number {
  if (endMs <= startMs) return timeMs >= endMs ? 1 : 0;
  return easing(clamp01((timeMs - startMs) / (endMs - startMs)));
}

export function CuebookMotionRoot({
  durationMs,
  externalTimeMs,
  autoplay = true,
  reducedMotion,
  exposeExternalControl = false,
  className,
  style,
  children,
}: CuebookMotionRootProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion ?? Boolean(prefersReducedMotion);
  const inView = useInView(rootRef, {amount: 0.55, once: true});
  const [wallTimeMs, setWallTimeMs] = React.useState(0);
  const [previewTimeMs, setPreviewTimeMs] = React.useState<number | undefined>();

  React.useEffect(() => {
    if (!exposeExternalControl) return undefined;
    window.__cuebookReady = true;
    window.__cuebookSetTime = (value: number) => {
      const next = Number.isFinite(value) ? Math.min(durationMs, Math.max(0, value)) : 0;
      setPreviewTimeMs(next);
    };
    return () => {
      delete window.__cuebookReady;
      delete window.__cuebookSetTime;
    };
  }, [durationMs, exposeExternalControl]);

  React.useEffect(() => {
    if (externalTimeMs !== undefined || previewTimeMs !== undefined || shouldReduceMotion) return undefined;
    if (!autoplay || !inView) return undefined;

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const next = Math.min(durationMs, now - startedAt);
      setWallTimeMs(next);
      if (next < durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoplay, durationMs, externalTimeMs, inView, previewTimeMs, shouldReduceMotion]);

  const requestedTime = externalTimeMs ?? previewTimeMs;
  const timeMs = shouldReduceMotion
    ? durationMs
    : Math.min(durationMs, Math.max(0, requestedTime ?? wallTimeMs));
  const progress = durationMs > 0 ? clamp01(timeMs / durationMs) : 1;

  return (
    <div
      ref={rootRef}
      className={className}
      style={style}
      data-cuebook-motion-root="true"
      data-time-ms={Math.round(timeMs)}
      data-motion-complete={timeMs >= durationMs ? "true" : "false"}
    >
      {children({timeMs, progress, reducedMotion: shouldReduceMotion, complete: timeMs >= durationMs})}
    </div>
  );
}

export function CuebookReveal({
  progress,
  children,
  distance = 18,
  axis = "y",
  style,
}: {
  progress: number;
  children: React.ReactNode;
  distance?: number;
  axis?: "x" | "y";
  style?: React.CSSProperties;
}) {
  const p = clamp01(progress);
  const transform = axis === "x"
    ? `translate3d(${(1 - p) * distance}px,0,0)`
    : `translate3d(0,${(1 - p) * distance}px,0)`;
  return (
    <motion.div initial={false} style={{...style, opacity: p, transform}}>
      {children}
    </motion.div>
  );
}

export function CuebookPath({
  d,
  progress,
  conditional = false,
  stroke = "currentColor",
  strokeWidth = 3,
  opacity = 1,
  ...props
}: React.ComponentProps<typeof motion.path> & {
  d: string;
  progress: number;
  conditional?: boolean;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}) {
  return (
    <motion.path
      {...props}
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={conditional ? "8 7" : undefined}
      initial={false}
      animate={{pathLength: clamp01(progress), opacity}}
      transition={{duration: 0}}
    />
  );
}

export function CuebookNumber({
  from = 0,
  to,
  progress,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  from?: number;
  to: number;
  progress: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const value = from + (to - from) * clamp01(progress);
  return <>{prefix}{value.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}{suffix}</>;
}

export function CuebookNowLine({
  x,
  top,
  height,
  progress,
  color = "#C9D2CD",
}: {
  x: number;
  top: number;
  height: number;
  progress: number;
  color?: string;
}) {
  const p = clamp01(progress);
  return (
    <motion.div
      initial={false}
      style={{
        position: "absolute",
        left: x,
        top,
        width: 1,
        height,
        transformOrigin: "top",
        transform: `scaleY(${p})`,
        opacity: p,
        background: color,
      }}
    />
  );
}
