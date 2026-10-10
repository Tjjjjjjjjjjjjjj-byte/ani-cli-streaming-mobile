// Small building blocks shared by the Settings page.

export function Section({ icon, title, hint, children }) {
  return (
    <section className="settings__section">
      <header className="settings__section-head">
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      <div className="settings__rows">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, stacked = false }) {
  return (
    <div className={`settings__row${stacked ? " settings__row--stacked" : ""}`}>
      <div className="settings__row-text">
        <p className="settings__label">{label}</p>
        {hint && <p className="settings__hint">{hint}</p>}
      </div>
      <div className="settings__control">{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

// A row of mutually exclusive choices: options = [[value, label], ...]
export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([optionValue, text]) => (
        <button
          key={String(optionValue)}
          type="button"
          role="radio"
          aria-checked={value === optionValue}
          className={value === optionValue ? "is-active" : ""}
          onClick={() => onChange(optionValue)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
