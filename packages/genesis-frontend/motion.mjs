import { animate, inView, scroll } from 'motion';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// Svelte actions: each lifecycle owns and cleans up only its own effects.
function effect(node, options, install) {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const original = node.getAttribute('style');
  let cleanup = () => {};
  const restore = () => original === null ? node.removeAttribute('style') : node.setAttribute('style', original);
  const refresh = () => { cleanup(); restore(); cleanup = preference.matches ? () => {} : install(node, options); };
  refresh(); preference.addEventListener('change', refresh);
  return { update(value) { options = value; refresh(); }, destroy() { cleanup(); restore(); preference.removeEventListener('change', refresh); } };
}
export function reveal(node, options = {}) {
  return effect(node, options, (element, value = {}) => {
    let animation;
    const stop = inView(element, () => {
      animation = animate(element, { opacity:[0,1], y:[value.distance ?? 24,0] }, { duration:value.duration ?? .65, delay:value.delay ?? 0, ease:[.22,1,.36,1] });
    }, { amount:value.amount ?? .15 });
    return () => { stop(); animation?.stop(); };
  });
}
export function parallax(node, options = {}) {
  return effect(node, options, (element, value = {}) => {
    const distance = Math.max(-120, Math.min(120, value.distance ?? 28));
    const animation = animate(element, { y:[-distance,distance] }, { ease:'linear' });
    const stop = scroll(animation, { target:element, offset:value.offset ?? ['start end','end start'] });
    return () => { stop(); animation.stop(); };
  });
}
export function scrollProgress(node) {
  return effect(node, {}, element => {
    element.style.transformOrigin = '0 50%';
    const animation = animate(element, { scaleX:[0,1] }, { ease:'linear' });
    const stop = scroll(animation);
    return () => { stop(); animation.stop(); };
  });
}
let smooth, owners = 0;
export function smoothScroll(_node, options = {}) {
  owners++;
  if (!smooth) smooth = new Lenis({ autoRaf:true, anchors:false, allowNestedScroll:true, duration:options.duration ?? 1.05 });
  return { destroy() { if (--owners === 0) { smooth.destroy(); smooth = undefined; } } };
}
