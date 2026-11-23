import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  format?: (val: number) => string;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = (n) => Math.round(n).toLocaleString('en-IN'),
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const safeTarget = Number.isFinite(value) ? value : 0;
  const prevRef = useRef(safeTarget);
  const [displayValue, setDisplayValue] = useState(safeTarget);

  useEffect(() => {
    if (prefersReducedMotion) {
      prevRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    const from = prevRef.current;
    if (Math.abs(from - safeTarget) < 0.005) {
      setDisplayValue(safeTarget);
      return;
    }

    const controls = animate(from, safeTarget, {
      duration: 0.48,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplayValue(latest),
      onComplete: () => {
        prevRef.current = safeTarget;
        setDisplayValue(safeTarget);
      },
    });

    return () => {
      prevRef.current = safeTarget;
      controls.stop();
    };
  }, [safeTarget, prefersReducedMotion]);

  return <span className={`tabular-nums ${className}`}>{format(displayValue)}</span>;
};

interface MotionCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  hoverLift?: boolean;
}

export const MotionCard: React.FC<MotionCardProps> = ({
  children,
  className = '',
  delay = 0,
  hoverLift = true,
}) => {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hoverLift && !prefersReducedMotion ? { y: -2 } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
};
