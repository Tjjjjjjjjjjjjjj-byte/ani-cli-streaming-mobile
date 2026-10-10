import { useEffect, useState } from "react";

function timeLeft(ms) {
  if (ms <= 0) return "any moment now";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function AiringCountdown({ episode, airingAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="airing" role="status">
      <span className="airing__dot" aria-hidden="true" />
      Episode {episode} airs in <strong>{timeLeft(airingAt * 1000 - now)}</strong>
    </p>
  );
}

export default AiringCountdown;
