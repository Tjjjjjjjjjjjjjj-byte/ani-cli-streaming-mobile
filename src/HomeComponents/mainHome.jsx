import Hero from "../discover/Hero";
import Row from "../discover/Row";
import ContinueRow from "../discover/ContinueRow";
import { useDiscover } from "../discover/useDiscover";

function MainHome() {
  const [discover, reload] = useDiscover();

  if (discover.status === "error") {
    return (
      <main className="discover">
        <div className="discover__message" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <p>{discover.error}</p>
          <button type="button" className="btn btn--outline" onClick={reload}>
            Try again
          </button>
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
        {discover.rows.map((row) => (
          <Row key={row.id} title={row.title} items={row.items} />
        ))}
      </div>
    </main>
  );
}
export default MainHome;
