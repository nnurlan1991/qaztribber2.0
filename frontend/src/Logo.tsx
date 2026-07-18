// QazTriber logo — gold waveform on transparent / obsidian backgrounds.
// Вариации: mark (квадрат с фоном), markLight (без фона), wordmark (горизонтальный).

interface LogoProps {
  size?: number;
  variant?: "mark" | "wordmark" | "markLight";
  className?: string;
}

/**
 * Полный логотип-марка: квадрат со скруглением, obsidian-фон, золотой эквалайзер + дуга.
 * Соответствует «qaztribber dark.svg».
 */
export function Logo({ size = 34, variant = "mark", className = "" }: LogoProps) {
  if (variant === "wordmark") return <Wordmark className={className} />;
  if (variant === "markLight") return <MarkLight size={size} className={className} />;
  return <MarkDark size={size} className={className} />;
}

const GOLD_STOPS = (
  <>
    <stop stopColor="#B8860B" />
    <stop offset="0.5" stopColor="#E6CA65" />
    <stop offset="1" stopColor="#996515" />
  </>
);

function MarkDark({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 342 342"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="QazTriber"
    >
      <path d="M261.844 0H80.1562C35.8872 0 0 35.8872 0 80.1562V261.844C0 306.113 35.8872 342 80.1562 342H261.844C306.113 342 342 306.113 342 261.844V80.1562C342 35.8872 306.113 0 261.844 0Z" fill="url(#qt-bg)" />
      <path d="M55 193C58.866 193 62 189.866 62 186C62 182.134 58.866 179 55 179C51.134 179 48 182.134 48 186C48 189.866 51.134 193 55 193Z" fill="url(#qt-g1)" />
      <path d="M87 162C87 158.686 84.3137 156 81 156C77.6863 156 75 158.686 75 162V210C75 213.314 77.6863 216 81 216C84.3137 216 87 213.314 87 210V162Z" fill="white" />
      <path d="M111 127C111 123.686 108.314 121 105 121C101.686 121 99 123.686 99 127V245C99 248.314 101.686 251 105 251C108.314 251 111 248.314 111 245V127Z" fill="url(#qt-g2)" />
      <path d="M135 97C135 93.6863 132.314 91 129 91C125.686 91 123 93.6863 123 97V275C123 278.314 125.686 281 129 281C132.314 281 135 278.314 135 275V97Z" fill="url(#qt-g3)" />
      <path d="M159 122C159 118.686 156.314 116 153 116C149.686 116 147 118.686 147 122V250C147 253.314 149.686 256 153 256C156.314 256 159 253.314 159 250V122Z" fill="white" />
      <path d="M177 62C177 58.6863 174.314 56 171 56C167.686 56 165 58.6863 165 62V310C165 313.314 167.686 316 171 316C174.314 316 177 313.314 177 310V62Z" fill="url(#qt-g4)" />
      <path d="M195 122C195 118.686 192.314 116 189 116C185.686 116 183 118.686 183 122V250C183 253.314 185.686 256 189 256C192.314 256 195 253.314 195 250V122Z" fill="white" />
      <path d="M219 97C219 93.6863 216.314 91 213 91C209.686 91 207 93.6863 207 97V275C207 278.314 209.686 281 213 281C216.314 281 219 278.314 219 275V97Z" fill="url(#qt-g5)" />
      <path d="M243 127C243 123.686 240.314 121 237 121C233.686 121 231 123.686 231 127V245C231 248.314 233.686 251 237 251C240.314 251 243 248.314 243 245V127Z" fill="url(#qt-g6)" />
      <path d="M267 162C267 158.686 264.314 156 261 156C257.686 156 255 158.686 255 162V210C255 213.314 257.686 216 261 216C264.314 216 267 213.314 267 210V162Z" fill="white" />
      <path d="M287 193C290.866 193 294 189.866 294 186C294 182.134 290.866 179 287 179C283.134 179 280 182.134 280 186C280 189.866 283.134 193 287 193Z" fill="url(#qt-g7)" />
      <path d="M153 97C156.314 97 159 94.3137 159 91C159 87.6863 156.314 85 153 85C149.686 85 147 87.6863 147 91C147 94.3137 149.686 97 153 97Z" fill="white" />
      <path d="M189 97C192.314 97 195 94.3137 195 91C195 87.6863 192.314 85 189 85C185.686 85 183 87.6863 183 91C183 94.3137 185.686 97 189 97Z" fill="white" />
      <path d="M55 115.919C63.7078 93.2806 79.0714 73.8128 99.0653 60.0815C119.059 46.3501 142.745 39 167 39C191.255 39 214.941 46.3501 234.935 60.0815C254.929 73.8128 270.292 93.2806 279 115.919" stroke="url(#qt-arc)" strokeWidth="5" strokeLinecap="round" />
      <defs>
        <linearGradient id="qt-bg" x1="0" y1="0" x2="342" y2="342" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4A0E17" />
          <stop offset="0.5" stopColor="#2D080E" />
          <stop offset="1" stopColor="#1A0306" />
        </linearGradient>
        <linearGradient id="qt-g1" x1="48" y1="193" x2="48" y2="179" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qt-g2" x1="99" y1="251" x2="99" y2="121" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qt-g3" x1="123" y1="281" x2="123" y2="91" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qt-g4" x1="165" y1="316" x2="165" y2="56" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qt-g5" x1="207" y1="281" x2="207" y2="91" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qt-g6" x1="231" y1="251" x2="231" y2="121" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qt-g7" x1="280" y1="193" x2="280" y2="179" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qt-arc" x1="55" y1="115.919" x2="55" y2="39" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
      </defs>
    </svg>
  );
}

/** Марка без obsidian-фона — только золотой эквалайзер (для светлых поверхностей). */
function MarkLight({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size * (280 / 246)}
      viewBox="0 0 246 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="QazTriber"
    >
      <path d="M7 156.5C10.866 156.5 14 153.366 14 149.5C14 145.634 10.866 142.5 7 142.5C3.13401 142.5 0 145.634 0 149.5C0 153.366 3.13401 156.5 7 156.5Z" fill="url(#qtL-g0)" />
      <path d="M39 125.5C39 122.186 36.3137 119.5 33 119.5C29.6863 119.5 27 122.186 27 125.5V173.5C27 176.814 29.6863 179.5 33 179.5C36.3137 179.5 39 176.814 39 173.5V125.5Z" fill="#210509" />
      <path d="M63 90.5C63 87.1863 60.3137 84.5 57 84.5C53.6863 84.5 51 87.1863 51 90.5V208.5C51 211.814 53.6863 214.5 57 214.5C60.3137 214.5 63 211.814 63 208.5V90.5Z" fill="url(#qtL-g1)" />
      <path d="M87 60.5C87 57.1863 84.3137 54.5 81 54.5C77.6863 54.5 75 57.1863 75 60.5V238.5C75 241.814 77.6863 244.5 81 244.5C84.3137 244.5 87 241.814 87 238.5V60.5Z" fill="url(#qtL-g2)" />
      <path d="M111 85.5C111 82.1863 108.314 79.5 105 79.5C101.686 79.5 99 82.1863 99 85.5V213.5C99 216.814 101.686 219.5 105 219.5C108.314 219.5 111 216.814 111 213.5V85.5Z" fill="#210509" />
      <path d="M129 25.5C129 22.1863 126.314 19.5 123 19.5C119.686 19.5 117 22.1863 117 25.5V273.5C117 276.814 119.686 279.5 123 279.5C126.314 279.5 129 276.814 129 273.5V25.5Z" fill="url(#qtL-g3)" />
      <path d="M147 85.5C147 82.1863 144.314 79.5 141 79.5C137.686 79.5 135 82.1863 135 85.5V213.5C135 216.814 137.686 219.5 141 219.5C144.314 219.5 147 216.814 147 213.5V85.5Z" fill="#210509" />
      <path d="M171 60.5C171 57.1863 168.314 54.5 165 54.5C161.686 54.5 159 57.1863 159 60.5V238.5C159 241.814 161.686 244.5 165 244.5C168.314 244.5 171 241.814 171 238.5V60.5Z" fill="url(#qtL-g4)" />
      <path d="M195 90.5C195 87.1863 192.314 84.5 189 84.5C185.686 84.5 183 87.1863 183 90.5V208.5C183 211.814 185.686 214.5 189 214.5C192.314 214.5 195 211.814 195 208.5V90.5Z" fill="url(#qtL-g5)" />
      <path d="M219 125.5C219 122.186 216.314 119.5 213 119.5C209.686 119.5 207 122.186 207 125.5V173.5C207 176.814 209.686 179.5 213 179.5C216.314 179.5 219 176.814 219 173.5V125.5Z" fill="#210509" />
      <path d="M239 156.5C242.866 156.5 246 153.366 246 149.5C246 145.634 242.866 142.5 239 142.5C235.134 142.5 232 145.634 232 149.5C232 153.366 235.134 156.5 239 156.5Z" fill="url(#qtL-g6)" />
      <path d="M105 60.5C108.314 60.5 111 57.8137 111 54.5C111 51.1863 108.314 48.5 105 48.5C101.686 48.5 99 51.1863 99 54.5C99 57.8137 101.686 60.5 105 60.5Z" fill="#210509" />
      <path d="M141 60.5C144.314 60.5 147 57.8137 147 54.5C147 51.1863 144.314 48.5 141 48.5C137.686 48.5 135 51.1863 135 54.5C135 57.8137 137.686 60.5 141 60.5Z" fill="#210509" />
      <path d="M7 79.4187C15.7078 56.7806 31.0714 37.3128 51.0653 23.5815C71.0593 9.85013 94.745 2.5 119 2.5C143.255 2.5 166.941 9.85013 186.935 23.5815C206.929 37.3128 222.292 56.7806 231 79.4187" stroke="url(#qtL-arc)" strokeWidth="5" strokeLinecap="round" />
      <defs>
        <linearGradient id="qtL-g0" x1="0" y1="156.5" x2="0" y2="142.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qtL-g1" x1="51" y1="214.5" x2="51" y2="84.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qtL-g2" x1="75" y1="244.5" x2="75" y2="54.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qtL-g3" x1="117" y1="279.5" x2="117" y2="19.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qtL-g4" x1="159" y1="244.5" x2="159" y2="54.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qtL-g5" x1="183" y1="214.5" x2="183" y2="84.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qtL-g6" x1="232" y1="156.5" x2="232" y2="142.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
        <linearGradient id="qtL-arc" x1="7" y1="79.4187" x2="7" y2="2.5" gradientUnits="userSpaceOnUse">{GOLD_STOPS}</linearGradient>
      </defs>
    </svg>
  );
}

/** Горизонтальный вариант-вордмарк (только эквалайзер, без текста). */
function Wordmark({ className }: { className: string }) {
  return <MarkLight size={48} className={className} />;
}
