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

function App() {
  if (STANDALONE) {
    return (
      <>
        <Navbar />
        <Routes>
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/downloads/:id" element={<LibraryAnimePage />} />
          <Route path="/downloads/:id/watch/:key" element={<LibraryWatchPage />} />
          <Route path="*" element={<Navigate to="/downloads" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <DownloadProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<MainHome />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/anime/:id" element={<SelectedAnimePage />} />
        <Route path="/anime/:id/trailer" element={<TrailerPage />} />
        <Route path="/anime/:id/watch/:episode" element={<WatchPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/downloads/:id" element={<LibraryAnimePage />} />
        <Route path="/downloads/:id/watch/:key" element={<LibraryWatchPage />} />
      </Routes>
    </DownloadProvider>
  );
}
export default App;
