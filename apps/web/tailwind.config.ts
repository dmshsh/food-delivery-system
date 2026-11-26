import type { Config } from 'tailwindcss';

/**
 * The dark theme, without touching every page.
 *
 * The pages are written in the ordinary Tailwind vocabulary: `bg-stone-50`,
 * `text-stone-900`, `border-stone-200`, `bg-emerald-50`. Adding a `dark:`
 * variant beside each of those would mean editing several hundred class lists
 * and keeping both copies in step forever.
 *
 * Instead the colours themselves are variables. `stone-50` still means "the
 * lightest surface" and `stone-900` still means "the strongest text" — in dark
 * mode those are simply different colours, defined once in globals.css. A page
 * that says `bg-stone-50 text-stone-900` reads correctly in both themes because
 * it was always describing a role, not a shade.
 *
 * The accents (emerald, amber, red, sky, violet) are handled the same way, but
 * only the tints actually used as backgrounds and text are redefined: in dark
 * mode a 50/100 tint has to become a deep, low-saturation version of itself,
 * or a "light green card" turns into a glaring block.
 *
 * `<alpha-value>` is what keeps `bg-emerald-50/40` and `text-white/70` working.
 */

/** Builds `rgb(var(--name) / <alpha-value>)` entries for a ramp. */
function ramp(name: string, shades: number[]): Record<string, string> {
  return Object.fromEntries(shades.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // The theme is a `data-theme` attribute on <html>, not a media query, because
  // a person has to be able to choose a theme that is not their system's.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        white: 'rgb(var(--white) / <alpha-value>)',
        stone: ramp('stone', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        emerald: ramp('emerald', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        amber: ramp('amber', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        red: ramp('red', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        sky: ramp('sky', [100, 900]),
        violet: ramp('violet', [100, 900]),
      },
      keyframes: {
        // One slow sweep across a loading block. Deliberately gentle: a skeleton
        // is there to say "this is coming", not to pull the eye away from the
        // part of the page that has already arrived.
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
