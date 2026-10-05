// Scroll storytelling for the home page. Each pinned scene gets --p, its
// progress from 0 to 1 while its stage is stuck to the screen; CSS and the
// code below turn that into movement. With reduced motion the story still
// follows the scroll, but troubles fade where they are instead of flying.
(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Put the visitor's own store first and highlight it.
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const platform = ios ? 'ios' : /Android/.test(ua) ? 'android' : null;
  if (platform) {
    for (const group of document.querySelectorAll('[data-stores]')) {
      const own = group.querySelector(`[data-platform="${platform}"]`);
      if (!own) continue;
      own.classList.add('primary');
      group.prepend(own);
    }
  }

  // Plain sections fade in once they come into view.
  const reveals = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('seen'));
  } else {
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('seen'); seen.unobserve(e.target); }
      }
    }, { threshold: 0.15 });
    reveals.forEach((el) => seen.observe(el));
  }

  // Pager: which scene is in the middle of the screen.
  const scenes = [...document.querySelectorAll('[data-scene]')];
  const pagerNow = document.querySelector('.pager-now');
  const pagerName = document.querySelector('.pager-name');
  document.querySelector('.pager-total').textContent = scenes.length;
  const updatePager = () => {
    const middle = innerHeight / 2;
    let index = 0;
    scenes.forEach((s, i) => { if (s.getBoundingClientRect().top <= middle) index = i; });
    pagerNow.textContent = index + 1;
    pagerName.textContent = scenes[index].dataset.scene;
  };

  const hero = document.querySelector('.hero');
  const stickers = [...hero.querySelectorAll('.sticker')];
  const features = document.querySelector('.features');
  const steps = [...features.querySelectorAll('.step')];
  const screens = [...features.querySelectorAll('.features-phone img')];
  features.style.setProperty('--steps', steps.length);

  const setStep = (index) => {
    steps.forEach((s, i) => s.classList.toggle('active', i === index));
    screens.forEach((s, i) => s.classList.toggle('active', i === index));
  };
  setStep(0);

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const progress = (el) => {
    const r = el.getBoundingClientRect();
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header')) || 64;
    const travel = r.height - (innerHeight - header);
    return travel <= 0 ? 0 : clamp((header - r.top) / travel);
  };

  let ticking = false;
  const frame = () => {
    ticking = false;
    // Hero: each trouble flies into the phone in turn, then the screen lights.
    const p = progress(hero);
    hero.style.setProperty('--p', p.toFixed(4));
    // The skip button belongs to the hero only.
    const r = hero.getBoundingClientRect();
    hero.classList.toggle('done', p >= 0.98 || r.bottom < innerHeight * 0.5);
    for (const s of stickers) {
      const t = ease(clamp((p - Number(s.dataset.delay)) / 0.4));
      if (still) { s.style.opacity = String(1 - t); continue; }
      s.style.transform =
        `translate(-50%, -50%) translate(calc(var(--dx) * ${1 - t}), calc(var(--dy) * ${1 - t}))` +
        ` rotate(calc(var(--r) * ${1 - t})) scale(${1 - 0.85 * t})`;
      s.style.opacity = String(1 - clamp((t - 0.6) / 0.4));
    }
    // Features: one step per stretch of scrolling.
    const f = progress(features);
    features.style.setProperty('--p', f.toFixed(4));
    setStep(Math.min(steps.length - 1, Math.floor(f * steps.length)));
    updatePager();
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  frame();

  // Clicking a step jumps the scroll to it, so the list also works as tabs.
  steps.forEach((step, i) => {
    step.style.cursor = 'pointer';
    step.addEventListener('click', () => {
      const r = features.getBoundingClientRect();
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header')) || 64;
      const travel = r.height - (innerHeight - header);
      scrollTo({ top: scrollY + r.top - header + travel * ((i + 0.5) / steps.length), behavior: still ? 'instant' : 'smooth' });
    });
  });
})();
