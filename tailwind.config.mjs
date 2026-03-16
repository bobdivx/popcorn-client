/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
        'tv': '1920px',
      },
      colors: {
        primary: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7', // Neon Violet principal
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
      },
      keyframes: {
        'fade-in-up': {
          '0%': {
            opacity: '0',
            transform: 'translateY(20px)',
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
            boxShadow: '0 0 5px rgba(124, 58, 237, 0.5), 0 0 10px rgba(124, 58, 237, 0.3)',
          },
          '50%': {
            boxShadow: '0 0 20px rgba(124, 58, 237, 0.8), 0 0 30px rgba(124, 58, 237, 0.5)',
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
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-in': 'slide-in 0.3s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out forwards',
        'glow': 'glow 2s ease-in-out infinite',
        'pulse-violet': 'pulse-violet 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ripple': 'ripple 0.6s ease-out',
        'focus-pinned-left': 'focus-pinned-left 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'fade-other-cards': 'fade-other-cards 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'trailer-immersive': 'trailer-immersive 1s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'bezier-scroll': 'bezier-scroll 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      },
      transitionProperty: {
        'all-smooth': 'all',
      },
      transitionDuration: {
        '2000': '2000ms',
      },
      boxShadow: {
        'glow-violet': '0 0 10px rgba(168, 85, 247, 0.5), 0 0 20px rgba(168, 85, 247, 0.3)',
        'glow-violet-lg': '0 0 20px rgba(168, 85, 247, 0.8), 0 0 40px rgba(168, 85, 247, 0.5)',
        'primary': '0 0 10px rgba(168, 85, 247, 0.5), 0 0 20px rgba(168, 85, 247, 0.3)',
        'primary-lg': '0 0 20px rgba(168, 85, 247, 0.8), 0 0 40px rgba(168, 85, 247, 0.5)',
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
    themes: ['dark', 'light'],
    darkTheme: 'dark',
  },
};
