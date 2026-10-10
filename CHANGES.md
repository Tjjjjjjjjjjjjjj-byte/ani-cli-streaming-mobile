# What's new

Continue watching row, resume inside an episode, next-episode countdown, touch gestures,
per-show sub/dub + speed + subtitle size, subtitle controls, download queue (pause/cancel),
auto-download next episodes + delete-after-watching, storage meter, local watchlist,
and a Settings page (playback, subtitles, storage, adult-content switch, viewing stats,
privacy, "Clear all personal data").

Everything personal is stored in this browser's localStorage. Nothing is uploaded.

Where things live:
- src/store/*           settings, history (resume + continue row), stats, watchlist, per-show prefs, clear-all
- src/player.jsx        resume, countdown card, gestures, custom subtitles + menu
- src/watch/DownloadProvider.jsx   the download queue
- src/library/DownloadQueue.jsx, StorageMeter.jsx, cleanup.js, useSavedEpisodes.js
- src/settings/*        Settings page, My list page
- backend/servers.js    pause/resume/cancel endpoints, per-request adult flag
