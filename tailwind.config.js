/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // heyvoca_front/src/index.css 브랜드 토큰과 동일 값 (앱 전용 서브셋)
        primary: {
          50: '#FFF4FC',
          100: '#FFEEFA',
          200: '#FFD7F3',
          300: '#FFBDEB',
          400: '#FFAAE6',
          500: '#FF88DC',
          600: '#FF70D4',
        },
        gray: {
          50: '#F5F5F5',
          100: '#DDDDDD',
          200: '#CCCCCC',
          300: '#999999',
          400: '#7B7B7B',
          500: '#404040',
        },
        success: {
          50: '#F6FEF9',
          100: '#ECFDF3',
          500: '#32D583',
          600: '#12B76A',
        },
        error: {
          50: '#FFFBFA',
          100: '#FEF3F2',
          500: '#F97066',
          600: '#FA5145',
        },
        black: '#111111',
      },
    },
  },
  plugins: [],
}