function ProgressRing({ value = null, size = 22, stroke = 3, tone = "default", children }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const spinning = value == null;
  const shown = spinning ? 0.28 : Math.max(0, Math.min(1, value));

  return (
    <span
      className={`ring ring--${tone}${spinning ? " is-spinning" : ""}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={spinning ? undefined : Math.round(shown * 100)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="ring__bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <span className="ring__center">{children}</span>}
    </span>
  );
}

export default ProgressRing;
