import { useContext, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { STANDALONE } from "../api";
import { IMPORT_EVENT } from "../library/useLibrary";
import { DownloadContext } from "../watch/useDownload";

function Navbar() {
  const navigate = useNavigate();
  const zipInput = useRef(null);
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const pending = useContext(DownloadContext)?.pending ?? 0;

  function handleSearch(e) {
    e.preventDefault();

    const term = searchInput.trim();

    const next = new URLSearchParams(pathname === "/search" ? params : undefined);
    next.delete("page");
    if (term) next.set("q", term);
    else next.delete("q");

    navigate(`/search${next.size ? `?${next}` : ""}`);
  }

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

      <form className="search-form" onSubmit={handleSearch} role="search">
        <span className="material-symbols-outlined search-icon" aria-hidden="true">
          search
        </span>
        <input
          className="search-input"
          type="text"
          aria-label="Search anime"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search anime"
        />
      </form>

      <button className="icon-btn" type="button" aria-label="My list" onClick={() => navigate("/list")}>
        <span className="material-symbols-outlined">bookmarks</span>
      </button>
      <button
        className="icon-btn downloads"
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
