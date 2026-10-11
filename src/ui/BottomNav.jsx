import { useContext } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { DownloadContext } from "../watch/useDownload";
import { STANDALONE } from "../api";
import { vibrate } from "../store/settings";

const TABS = [
  { to: "/", end: true, icon: "home", label: "Home" },
  { to: "/search", icon: "search", label: "Search" },
  { to: "/list", icon: "bookmarks", label: "My list" },
  { to: "/schedule", icon: "calendar_month", label: "Schedule" },
  { to: "/downloads", icon: "video_library", label: "Library" },
];

const STANDALONE_TABS = [
  { to: "/downloads", icon: "video_library", label: "Library" },
  { to: "/settings", icon: "settings", label: "Settings" },
];

// Thumb-reach navigation for phones. CSS hides it on wide screens and while a video page is open.
function BottomNav() {
  const { pathname } = useLocation();
  const pending = useContext(DownloadContext)?.pending ?? 0;
  const tabs = STANDALONE ? STANDALONE_TABS : TABS;
  // The watch pages are full-bleed players; a nav bar there would just get in the way.
  if (/\/watch\//.test(pathname)) return null;

  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `bottom-nav__tab${isActive ? " is-active" : ""}`}
          onClick={() => vibrate(6)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">{tab.icon}</span>
          <span className="bottom-nav__label">{tab.label}</span>
          {tab.to === "/downloads" && pending > 0 && (
            <span className="bottom-nav__badge" aria-label={`${pending} downloading`}>{pending}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;
