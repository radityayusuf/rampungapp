/** @type {import('tailwindcss').Config} */
// Token warna diambil dari mockup UI Rampung (canvas "Mockup UI Rampung").
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0B7A6B', // tombol utama, link
          hover: '#075A4F',
          bright: '#0F9D8A', // warna utama brand: progres, selesai
          ink: '#0B5F54', // teks di atas latar tosca muda
          soft: '#E3F3F0',
          tint: '#F7FBFA',
        },
        kunyit: {
          DEFAULT: '#F2B33D',
          ink: '#3D2A00',
          text: '#6B4A00',
          warn: '#8A5A00',
          soft: '#FDF3DC',
        },
        arang: {
          DEFAULT: '#1F2933',
          body: '#3D4750',
          muted: '#5B6670',
          faint: '#8A949B',
          mist: '#A9B4BB',
          cloud: '#C9D1D6',
        },
        line: {
          DEFAULT: '#E2E5E1',
          soft: '#ECEEEA',
          strong: '#C9CEC8',
        },
        canvas: {
          DEFAULT: '#F5F6F4',
          subtle: '#F7F8F6',
          seg: '#E7EAE6',
        },
        danger: { DEFAULT: '#B42318', soft: '#FDECEA' },
        biru: { DEFAULT: '#1D5FA8', soft: '#E6EFFA' },
        ungu: { DEFAULT: '#5B3AA8', av: '#6B46C1', soft: '#F0EBFB' },
        oranye: { DEFAULT: '#9A3F0B', av: '#B4530B', soft: '#FCEBE3' },
        abu: { dot: '#9AA39C' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};
