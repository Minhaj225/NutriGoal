import { useEffect } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useScrollReveal(selector = '.reveal-up', options = {}) {
  const { y = 20, duration = 0.4, ease = 'power2.out', start = 'top 80%',
    toggleActions = 'play none none none' } = options;
  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const elements = gsap.utils.toArray(selector);
      
      elements.forEach((el) => {
        gsap.fromTo(
          el,
          { 
            opacity: 0, 
            y
          },
          {
            opacity: 1,
            y: 0,
            duration,
            ease,
            scrollTrigger: {
              trigger: el,
              start,
              toggleActions,
            },
          }
        );
      });
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      const elements = gsap.utils.toArray(selector);
      elements.forEach((el) => {
        gsap.set(el, { opacity: 1, y: 0 });
      });
    });

    return () => mm.revert();
  }, [selector, y, duration, ease, start, toggleActions]);
}
