export default function AuthPageBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=2400&q=90")',
          backgroundPosition: 'center 52%',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] bg-white/70 lg:bg-[linear-gradient(90deg,rgba(248,251,255,0.93)_0%,rgba(248,251,255,0.79)_34%,rgba(248,251,255,0.18)_62%,rgba(248,251,255,0.78)_100%)]"
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-28 w-full sm:h-40 lg:h-52"
        viewBox="0 0 1440 260"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="auth-blueprint-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" fill="none" stroke="#64748b" strokeOpacity=".22" strokeWidth="1" />
          </pattern>
        </defs>
        <path
          d="M0 58C205 154 440 196 690 188C1010 178 1220 83 1440 111V260H0Z"
          fill="white"
          fillOpacity=".94"
        />
        <path
          d="M840 182C1070 167 1240 87 1440 111V260H840Z"
          fill="url(#auth-blueprint-grid)"
          opacity=".8"
        />
        <path
          d="M0 58C205 154 440 196 690 188C1010 178 1220 83 1440 111"
          fill="none"
          stroke="#079568"
          strokeWidth="11"
        />
        <path
          d="M1000 232L1120 176L1190 206L1310 132L1400 163M1090 260L1220 199L1290 225L1380 175"
          fill="none"
          stroke="#64748b"
          strokeOpacity=".36"
          strokeWidth="2"
        />
      </svg>
    </>
  );
}
