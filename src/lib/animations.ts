import gsap from 'gsap';
import { useEffect, useRef } from 'react';

/**
 * Shared GSAP timing tokens. Keep these aligned with the CSS transition feel
 * (cubic-bezier(0.4, 0, 0.2, 1), 150-200ms) so JS-driven and CSS-driven
 * motion blend naturally.
 */
export const motion = {
  duration: {
    micro: 0.18,
    base: 0.28,
    enter: 0.32,
  },
  ease: {
    out: 'power2.out',
    inOut: 'power2.inOut',
    soft: 'expo.out',
  },
} as const;

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Modal entrance — fade + scale-up. Skips animation when the user has asked
 * for reduced motion (the element simply appears).
 */
export const animateModalEnter = (target: Element | null) => {
  if (!target) return;
  if (prefersReducedMotion()) {
    gsap.set(target, { clearProps: 'all' });
    return;
  }
  gsap.fromTo(
    target,
    { opacity: 0, scale: 0.96, y: 8 },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: motion.duration.enter,
      ease: motion.ease.soft,
      clearProps: 'transform',
    },
  );
};

/**
 * Stagger a list of children fading + sliding in. `selector` is the immediate
 * child selector relative to `container`.
 */
export const animateStaggerIn = (
  container: Element | null,
  selector: string,
  options: { stagger?: number; y?: number } = {},
) => {
  if (!container) return;
  if (prefersReducedMotion()) return;
  const { stagger = 0.025, y = 6 } = options;
  const items = container.querySelectorAll(selector);
  if (!items.length) return;
  gsap.fromTo(
    items,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration: motion.duration.base,
      ease: motion.ease.out,
      stagger,
      clearProps: 'transform',
    },
  );
};

/**
 * Crossfade hook — call when a key (e.g. active tab id) changes to fade the
 * referenced element from a slight offset back into place. Useful for tab
 * switches that would otherwise "snap".
 */
export const useGsapCrossfade = (
  ref: React.RefObject<HTMLElement>,
  key: unknown,
) => {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      node,
      { opacity: 0, y: 4 },
      {
        opacity: 1,
        y: 0,
        duration: motion.duration.base,
        ease: motion.ease.out,
        clearProps: 'transform',
      },
    );
    // Eslint exhaustive-deps would flag `ref`, but RefObjects are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
};

/**
 * Hook that runs a one-shot entrance animation on mount.
 */
export const useGsapEntrance = (
  ref: React.RefObject<HTMLElement>,
  variant: 'modal' | 'fade-up' = 'fade-up',
) => {
  const hasPlayed = useRef(false);
  useEffect(() => {
    if (hasPlayed.current) return;
    const node = ref.current;
    if (!node) return;
    hasPlayed.current = true;
    if (variant === 'modal') {
      animateModalEnter(node);
    } else {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        node,
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: motion.duration.enter,
          ease: motion.ease.out,
          clearProps: 'transform',
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
