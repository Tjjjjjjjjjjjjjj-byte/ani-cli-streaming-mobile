import Hero from "../discover/Hero";
import Row from "../discover/Row";
import ContinueRow from "../discover/ContinueRow";
import BecauseRows from "../discover/BecauseRows";
import LazyRows from "../discover/LazyRows";
import { useDiscover } from "../discover/useDiscover";
import RetryButton from "../ui/RetryButton";
import { useRefreshHandler } from "../ui/PullToRefresh";

function MainHome() {
  const [discover, reload] = useDiscover();
  // Pull-to-refresh reloads just the home rows instead of the whole app.
  useRefreshHandler(reload);

  if (discover.status === "error") {
    return (
      <main className="discover">
        <div className="discover__message" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <p>{discover.error}</p>
          <RetryButton onRetry={reload} auto={discover.limited} />
        </div>
      </main>
    );
  }

  if (discover.status === "loading") {
    return (
      <main className="discover" aria-busy="true" aria-label="Loading">
        <div className="hero hero--skeleton skeleton" />
        {[0, 1, 2].map((n) => (
          <section className="row" key={n}>
            <div className="skeleton skeleton--title" />
            <div className="row__track">
              {Array.from({ length: 8 }, (_, i) => (
                <div className="row__item" key={i}>
                  <div className="skeleton skeleton--poster" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    );
  }

  return (
    <main className="discover">
      {discover.hero.length > 0 && <Hero items={discover.hero} />}
      <div className="discover__rows">
        <ContinueRow />
        <BecauseRows />
        {discover.rows.map((row) => (
          <Row key={row.id} title={row.title} items={row.items} />
        ))}
        <LazyRows />
      </div>
    </main>
  );
}
export default MainHome;
