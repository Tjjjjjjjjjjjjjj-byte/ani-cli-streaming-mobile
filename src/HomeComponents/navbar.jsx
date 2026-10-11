import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { STANDALONE } from "../api";
import { IMPORT_EVENT } from "../library/useLibrary";
import { DownloadContext } from "../watch/useDownload";
import { useSettings } from "../store/settings";
import { clearRecentSearches, forgetSearch, rememberSearch, useRecentSearches } from "../store/searchStore";

function Navbar() {
  const navigate = useNavigate();
  const zipInput = useRef(null);
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const pending = useContext(DownloadContext)?.pending ?? 0;
  const [settings] = useSettings();
  const recent = useRecentSearches();
  const [focused, setFocused] = useState(false);
  const typing = useRef(null);

  useEffect(() => () => clearTimeout(typing.current), []);

  function goSearch(rawTerm, replace = false) {
    const term = rawTerm.trim();

    const next = new URLSearchParams(pathname === "/search" ? params : undefined);
    next.delete("page");
    if (term) next.set("q", term);
    else next.delete("q");

    navigate(`/search${next.size ? `?${next}` : ""}`, { replace });
  }

  function handleSearch(e) {
    e.preventDefault();
    clearTimeout(typing.current);
    rememberSearch(searchInput);
    goSearch(searchInput);
    setFocused(false);
    document.activeElement?.blur?.();
  }

  // Search as you type: wait until you pause, and replace the history entry so Back doesn't replay every keystroke.
  function handleTyping(value) {
    setSearchInput(value);
    clearTimeout(typing.current);
    const term = value.trim();
    if (!settings.searchAsYouType) return;
    if (term.length >= 2 || (term === "" && pathname === "/search")) {
      typing.current = setTimeout(() => goSearch(value, pathname === "/search"), 450);
    }
  }

  function pickRecent(term) {
    setSearchInput(term);
    rememberSearch(term);
    goSearch(term);
    setFocused(false);
  }

  const showRecent = focused && settings.saveSearches && searchInput.trim() === "" && recent.length > 0;

  function goToLibrary(term, replace = false) {
    const q = term.trim();
    navigate(`/downloads${q ? `?q=${encodeURIComponent(q)}` : ""}`, { replace });
  }

  function handleLibrarySearch(e) {
    e.preventDefault();
    goToLibrary(searchInput);
  }

  if (STANDALONE) {
    return (
      <nav className="navbar">
        <button
          className="icon-btn home-btn"
          type="button"
          aria-label="Library"
          onClick={() => {
            setSearchInput("");
            navigate("/downloads");
          }}
        >
          <span className="material-symbols-outlined">video_library</span>
        </button>

        <form className="search-form" onSubmit={handleLibrarySearch} role="search">
          <span className="material-symbols-outlined search-icon" aria-hidden="true">
            search
          </span>
          <input
            className="search-input"
            type="search"
            enterKeyHint="search"
            aria-label="Search your library"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              if (pathname === "/downloads") goToLibrary(e.target.value, true);
            }}
            placeholder="Search your library"
          />
        </form>

        <button className="icon-btn downloads" type="button" aria-label="Add an exported zip" onClick={() => zipInput.current?.click()}>
          <span className="material-symbols-outlined">upload_file</span>
        </button>
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (!file) return;
            navigate("/downloads");
            setTimeout(() => window.dispatchEvent(new CustomEvent(IMPORT_EVENT, { detail: file })), 0);
          }}
        />
        <button className="icon-btn" type="button" aria-label="Settings" onClick={() => navigate("/settings")}>
          <span className="material-symbols-outlined">settings</span>
        </button>
      </nav>
    );
  }

  return (
    <nav className="navbar">
      <button
        className="icon-btn home-btn"
        type="button"
        aria-label="Home"
        onClick={() => navigate("/")}
      >
        <span className="material-symbols-outlined">home</span>
      </button>

      <form
        className="search-form"
        onSubmit={handleSearch}
        role="search"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
      >
        <span className="material-symbols-outlined search-icon" aria-hidden="true">
          search
        </span>
        <input
          className="search-input"
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Search anime"
          value={searchInput}
          onFocus={() => setFocused(true)}
          onChange={(e) => handleTyping(e.target.value)}
          placeholder="Search anime"
        />

        {showRecent && (
          <div className="recent" aria-label="Recent searches">
            <div className="recent__head">
              <span>Recent searches</span>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={clearRecentSearches}>
                Clear
              </button>
            </div>
            <ul>
              {recent.map((term) => (
                <li key={term}>
                  <button type="button" className="recent__term" onMouseDown={(e) => e.preventDefault()} onClick={() => pickRecent(term)}>
                    <span className="material-symbols-outlined" aria-hidden="true">history</span>
                    {term}
                  </button>
                  <button
                    type="button"
                    className="recent__remove"
                    aria-label={`Remove ${term} from recent searches`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => forgetSearch(term)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">close</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      <button className="icon-btn nav-extra" type="button" aria-label="Airing schedule" onClick={() => navigate("/schedule")}>
        <span className="material-symbols-outlined">calendar_month</span>
      </button>
      <button className="icon-btn nav-extra" type="button" aria-label="My list" onClick={() => navigate("/list")}>
        <span className="material-symbols-outlined">bookmarks</span>
      </button>
      <button
        className="icon-btn downloads nav-extra"
        type="button"
        aria-label={pending > 0 ? `Downloads, ${pending} in progress` : "Downloads"}
        onClick={() => navigate("/downloads")}
      >
        <span className="material-symbols-outlined">download</span>
        {pending > 0 && <span className="icon-btn__badge">{pending}</span>}
      </button>
      <button className="icon-btn" type="button" aria-label="Settings" onClick={() => navigate("/settings")}>
        <span className="material-symbols-outlined">settings</span>
      </button>
    </nav>
  );
}

export default Navbar;
