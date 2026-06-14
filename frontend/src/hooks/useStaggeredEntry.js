import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function useStaggeredEntry(dependencyArray = []) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Check if container has children
    if (containerRef.current.children.length === 0) return;

    let mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Set initial state
      gsap.set(containerRef.current.children, {
        opacity: 0,
        y: 16 // equivalent to translate-y-4
      });

      // Animate
      gsap.to(containerRef.current.children, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.05,
        ease: 'power2.out',
        clearProps: 'all' // Clean up inline styles after animation
      });
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(containerRef.current.children, {
        opacity: 1,
        y: 0
      });
    });

    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, ...dependencyArray]);

  return containerRef;
}
