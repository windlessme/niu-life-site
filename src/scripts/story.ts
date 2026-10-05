// Scroll storytelling for the home page, with GSAP ScrollTrigger.
// The hero and the features pin below the header and play with the
// scroll. Everyone gets the full animation, whatever the system's
// reduced-motion setting says (the owner's decision, 2026-10-05).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const header = () => document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 64;
const $ = <T extends Element>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const $$ = <T extends Element>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];

/** Sticker offsets scale with the viewport: wide across, shorter down. */
const spread = (el: HTMLElement) => ({
  x: Number(el.dataset.x) * Math.min(innerWidth * 0.0078, 11),
  y: Number(el.dataset.y) * Math.min(innerHeight * 0.0062, 6),
});

// ── 1 · Troubles fly into the phone, and the phone wakes up. ────────────
const hero = $<HTMLElement>('.hero');
const stickers = $$<HTMLElement>('.sticker', hero);
gsap.set(stickers, {
  xPercent: -50,
  yPercent: -50,
  x: (_i, el) => spread(el).x,
  y: (_i, el) => spread(el).y,
  rotation: (_i, el) => Number(el.dataset.r),
});
gsap
  .timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: hero,
      start: () => `top ${header()}`,
      end: '+=200%',
      pin: $('.stage', hero),
      scrub: 0.6,
      invalidateOnRefresh: true,
      onLeave: () => document.body.classList.add('hero-done'),
      onEnterBack: () => document.body.classList.remove('hero-done'),
    },
  })
  .fromTo('.hero-phone .phone', { scale: 0.9 }, { scale: 1.12, duration: 1, ease: 'none' }, 0)
  .to('.scroll-hint', { opacity: 0, duration: 0.1 }, 0)
  .to('.hero-copy', { y: -50, opacity: 0, duration: 0.3 }, 0.1)
  .to(
    stickers,
    { x: 0, y: 0, rotation: 0, scale: 0.12, opacity: 0, duration: 0.45, stagger: 0.06, ease: 'power3.in' },
    0.05,
  )
  .to('.phone-off', { opacity: 0, duration: 0.2 }, 0.55)
  .fromTo('.hero-after', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.25 }, 0.72)
  .to({}, { duration: 0.1 });

// ── 3 · Features step through, the phone following along. ──────────────
const features = $<HTMLElement>('.features');
const steps = $$<HTMLElement>('.step', features);
const screens = $$<HTMLImageElement>('.screen img', features);
const bar = $<HTMLElement>('.progress span', features);
let current = 0;
const show = (index: number) => {
  if (index === current) return;
  const down = index > current;
  current = index;
  steps.forEach((s, i) => s.classList.toggle('active', i === index));
  screens.forEach((s, i) => s.classList.toggle('active', i === index));
  gsap.fromTo(screens[index], { yPercent: down ? 6 : -6 }, { yPercent: 0, duration: 0.45, ease: 'power2.out' });
  gsap.fromTo('.screen .phone', { rotate: down ? -1.5 : 1.5 }, { rotate: 0, duration: 0.6, ease: 'back.out(3)' });
};
const tour = ScrollTrigger.create({
  trigger: features,
  start: () => `top ${header()}`,
  end: () => `+=${steps.length * 70}%`,
  pin: $('.stage', features),
  invalidateOnRefresh: true,
  onUpdate: (self) => {
    bar.style.transform = `scaleX(${self.progress})`;
    show(Math.min(steps.length - 1, Math.floor(self.progress * steps.length)));
  },
});
// Each step's heading jumps to its stretch of the scroll.
steps.forEach((step, i) =>
  $<HTMLButtonElement>('.step-head', step).addEventListener('click', () =>
    scrollTo({ top: tour.start + (tour.end - tour.start) * ((i + 0.5) / steps.length), behavior: 'smooth' }),
  ),
);

// ── Plain sections rise in as they arrive. ──────────────────────────────
gsap.set('.reveal', { opacity: 0, y: 28 });
ScrollTrigger.batch('.reveal', {
  start: 'top 88%',
  once: true,
  onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.6, stagger: 0.07, ease: 'power2.out' }),
});

// ── Pager: which scene holds the middle of the screen. ─────────────────
const scenes = $$<HTMLElement>('[data-scene]');
const now = $<HTMLElement>('.pager-now');
const name = $<HTMLElement>('.pager-name');
$<HTMLElement>('.pager-total').textContent = String(scenes.length);
scenes.forEach((scene, i) =>
  ScrollTrigger.create({
    trigger: scene,
    start: 'top center',
    end: 'bottom center',
    onToggle: (self) => {
      if (!self.isActive) return;
      now.textContent = String(i + 1);
      name.textContent = scene.dataset.scene ?? '';
    },
  }),
);

// Images settle the layout late; measure again once everything is in.
addEventListener('load', () => ScrollTrigger.refresh());
