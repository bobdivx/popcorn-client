const CORAL = {
  50: '#fff1f2',
  100: '#ffe1e3',
  200: '#ffc8cb',
  300: '#ffa1a6',
  400: '#fb7a80',
  500: '#f2545b',
  600: '#e03a42',
  700: '#bd2a31',
  800: '#9c262c',
  900: '#82252a',
  950: '#470e11',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
        'tv': '1280px',
        // Overlay lecteur : hauteur trop basse pour le layout « carte verticale ».
        'short': { raw: '(max-height: 42rem)' },
        'landscape-compact': { raw: '(orientation: landscape) and (max-height: 42rem)' },
        // Variante dédiée : évite que Tailwind extraie `hover:hover` depuis
        // `[@media(hover:hover)]`, ce qui génère du CSS daisyUI invalide (`:hovertr`).
        'can-hover': { raw: '(hover: hover)' },
      },
      colors: {
        // Accent éditorial unique (corail #f2545b) — remplace l’ancien violet néon.
        // purple / violet / indigo / fuchsia hérités : alias corail (classes legacy bg-purple-*,
        // ring-violet-*, bg-indigo-500/10…) — plus aucune teinte violette dans le bundle.
        purple: CORAL,
        violet: CORAL,
        indigo: CORAL,
        fuchsia: CORAL,
        primary: {
          50: '#fff1f2',
          100: '#ffe1e3',
          200: '#ffc8cb',
          300: '#ffa1a6',
          400: '#fb7a80',
          500: '#f2545b',
          600: '#e03a42',
          700: '#bd2a31',
          800: '#9c262c',
          900: '#82252a',
          950: '#470e11',
        },
      },
      keyframes: {
        'fade-in-up': {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'fade-in': {
          '0%': {
            opacity: '0',
          },
          '100%': {
            opacity: '1',
          },
        },
        'slide-in': {
          '0%': {
            transform: 'translateX(-100%)',
          },
          '100%': {
            transform: 'translateX(0)',
          },
        },
        'scale-in': {
          '0%': {
            transform: 'scale(0.95)',
            opacity: '0',
          },
          '100%': {
            transform: 'scale(1)',
            opacity: '1',
          },
        },
        'glow': {
          '0%, 100%': {
            boxShadow: '0 0 5px rgba(242, 84, 91, 0.5), 0 0 10px rgba(242, 84, 91, 0.3)',
          },
          '50%': {
            boxShadow: '0 0 20px rgba(242, 84, 91, 0.8), 0 0 30px rgba(242, 84, 91, 0.5)',
          },
        },
        'pulse-violet': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.7',
          },
        },
        'ripple': {
          '0%': {
            transform: 'scale(0)',
            opacity: '1',
          },
          '100%': {
            transform: 'scale(4)',
            opacity: '0',
          },
        },
        'focus-pinned-left': {
          '0%': {
            transform: 'scale(1) translateX(0)',
            opacity: '1',
          },
          '100%': {
            transform: 'scale(1.2) translateX(-10%)',
            opacity: '1',
          },
        },
        'fade-other-cards': {
          '0%': {
            opacity: '1',
          },
          '100%': {
            opacity: '0.4',
          },
        },
        'trailer-immersive': {
          '0%': {
            opacity: '0',
            transform: 'scale(1)',
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1.1)',
          },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'bezier-scroll': {
          '0%': {
            transform: 'translateX(0)',
          },
          '100%': {
            transform: 'translateX(-100px)',
          },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in': 'slide-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both',
        'glow': 'glow 2s ease-in-out infinite',
        'pulse-violet': 'pulse-violet 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ripple': 'ripple 0.6s ease-out',
        'focus-pinned-left': 'focus-pinned-left 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'fade-other-cards': 'fade-other-cards 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'trailer-immersive': 'trailer-immersive 1s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'shimmer': 'shimmer 2s infinite linear',
        'bezier-scroll': 'bezier-scroll 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      },
      transitionProperty: {
        'all-smooth': 'all',
      },
      transitionDuration: {
        '2000': '2000ms',
      },
      boxShadow: {
        'glow-violet': '0 0 10px rgba(242, 84, 91, 0.5), 0 0 20px rgba(242, 84, 91, 0.3)',
        'glow-violet-lg': '0 0 20px rgba(242, 84, 91, 0.8), 0 0 40px rgba(242, 84, 91, 0.5)',
        'primary': '0 0 10px rgba(242, 84, 91, 0.5), 0 0 20px rgba(242, 84, 91, 0.3)',
        'primary-lg': '0 0 20px rgba(242, 84, 91, 0.8), 0 0 40px rgba(242, 84, 91, 0.5)',
      },
      spacing: {
        'tv-gap': '2rem', // 32px
        'tv-padding': '3rem', // 48px
        'tv-card-min': '300px',
        'tv-card-min-lg': '400px',
      },
      minWidth: {
        'tv-card': '300px',
        'tv-card-lg': '400px',
      },
      minHeight: {
        'tv-card': '450px',
        'tv-hero': '600px',
      },
      fontSize: {
        'tv-title': '3rem', // 48px
        'tv-base': '1.25rem', // 20px
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        dark: {
          ...require('daisyui/src/theming/themes')['dark'],
          primary: '#f2545b',
          'primary-content': '#ffffff',
          secondary: '#f4f1ec',
          'secondary-content': '#0c0d10',
          accent: '#f2545b',
          'accent-content': '#ffffff',
          'base-100': '#0c0d10',
          'base-200': '#121318',
          'base-300': '#1a1b21',
          '--rounded-btn': '999px',
          '--rounded-badge': '999px',
          '--animation-btn': '0.2s',
          '--btn-focus-scale': '0.98',
        },
      },
      {
        // Thème clair : même accent corail (le 'light' daisyUI par défaut est indigo/violet #491eff).
        light: {
          ...require('daisyui/src/theming/themes')['light'],
          primary: '#e03a42',
          'primary-content': '#ffffff',
          secondary: '#18181b',
          'secondary-content': '#ffffff',
          accent: '#e03a42',
          'accent-content': '#ffffff',
        },
      },
    ],
    darkTheme: 'dark',
  },
};
