import { Routes, Route, Navigate } from "react-router-dom";
import { STANDALONE } from "./api";
import Navbar from "./HomeComponents/navbar.jsx";
import MainHome from "./HomeComponents/mainHome.jsx";
import SearchPage from "./searchpagecomponents/searchPage.jsx";
import SelectedAnimePage from "./selectedAnimePage.jsx";
import WatchPage from "./watchPage.jsx";
import TrailerPage from "./TrailerPage.jsx";
import DownloadProvider from "./watch/DownloadProvider.jsx";
import DownloadsPage from "./library/DownloadsPage.jsx";
import LibraryAnimePage from "./library/LibraryAnimePage.jsx";
import LibraryWatchPage from "./library/LibraryWatchPage.jsx";
import SettingsPage from "./settings/SettingsPage.jsx";
import WatchlistPage from "./settings/WatchlistPage.jsx";
import SchedulePage from "./settings/SchedulePage.jsx";
import VimNav from "./vim/VimNav.jsx";
import BottomNav from "./ui/BottomNav.jsx";
import ScrollMemory from "./ui/ScrollMemory.jsx";
import PullToRefresh from "./ui/PullToRefresh.jsx";
import SkipLink from "./ui/SkipLink.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";

function App() {
  if (STANDALONE) {
    return (
      <>
        <SkipLink />
        <VimNav />
        <ScrollMemory />
        <PullToRefresh />
        <Navbar />
        <ErrorBoundary>
          <Routes>
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/downloads/:id" element={<LibraryAnimePage />} />
            <Route path="/downloads/:id/watch/:key" element={<LibraryWatchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/downloads" replace />} />
          </Routes>
        </ErrorBoundary>
        <BottomNav />
      </>
    );
  }

  return (
    <DownloadProvider>
      <SkipLink />
      <VimNav />
      <ScrollMemory />
      <PullToRefresh />
      <Navbar />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<MainHome />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/anime/:id" element={<SelectedAnimePage />} />
          <Route path="/anime/:id/trailer" element={<TrailerPage />} />
          <Route path="/anime/:id/watch/:episode" element={<WatchPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/downloads/:id" element={<LibraryAnimePage />} />
          <Route path="/downloads/:id/watch/:key" element={<LibraryWatchPage />} />
          <Route path="/list" element={<WatchlistPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </ErrorBoundary>
      <BottomNav />
    </DownloadProvider>
  );
}
export default App;
