<script>
  import { onMount } from 'svelte';
  import { media } from '@arkom/assets';
  let { asset, alt = '', class: className = '', showControls = true } = $props();
  let reduced = $state(true), paused = $state(false);
  const image = $derived(media[asset]);
  onMount(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => reduced = preference.matches;
    change(); preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  });
</script>
{#if image}
  <figure class={`arkom-animation ${className}`}>
    <img src={paused || reduced ? image.poster : image.src} alt={alt || image.alt} width={image.width} height={image.height} />
    {#if showControls && !reduced}
      <button type="button" onclick={() => paused = !paused} aria-pressed={paused}>{paused ? 'Reproduzir animação' : 'Pausar animação'}</button>
    {/if}
  </figure>
{/if}
<style>
  figure { position:relative; margin:0; border-radius:inherit; }
  img { display:block; width:100%; height:auto; border-radius:inherit; }
  button { position:absolute; bottom:12px; right:12px; padding:8px 12px; border:1px solid #ffffff60; border-radius:999px; color:white; background:#152923dd; font:500 11px/1.4 system-ui,sans-serif; cursor:pointer; }
  button:focus-visible { outline:3px solid #f2b05d; outline-offset:3px; }
</style>
