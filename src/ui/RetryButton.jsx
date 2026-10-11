import { useEffect, useRef, useState } from "react";

// "Try again" with a visible countdown. After `seconds` it retries by itself (up to `maxAuto` times),
// which is what you want for rate limits: waiting is the fix. Press it any time to retry immediately.
function RetryButton({ onRetry, seconds = 30, maxAuto = 3, auto = true, className = "btn btn--outline" }) {
  const [left, setLeft] = useState(auto ? seconds : 0);
  const attempts = useRef(0);
  const retry = useRef(onRetry);

  useEffect(() => {
    retry.current = onRetry;
  });

  useEffect(() => {
    if (!auto || left <= 0) return undefined;
    const timer = setTimeout(() => {
      if (left === 1 && attempts.current < maxAuto) {
        attempts.current += 1;
        retry.current?.();
      }
      setLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [left, auto, maxAuto]);

  return (
    <button type="button" className={className} onClick={() => onRetry?.()}>
      <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
      {left > 0 ? `Retry now (auto in ${left}s)` : "Try again"}
    </button>
  );
}

export default RetryButton;
