import { useEffect } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useScrollReveal(selector = '.reveal-up', options = {}) {
  useEffect(() => {
    let mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const elements = gsap.utils.toArray(selector);
      
      elements.forEach((el) => {
        gsap.fromTo(
          el,
          { 
            opacity: 0, 
            y: options.y || 20 
          },
          {
            opacity: 1,
            y: 0,
            duration: options.duration || 0.4,
            ease: options.ease || 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: options.start || 'top 80%',
              toggleActions: options.toggleActions || 'play none none none',
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
  }, [selector, options]);
}
