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

## Polish round (third)
- Anime page: tabs for Episodes / Related / Trailer. "Related" lists direct prequels and parents first, then sequels, side stories and spin-offs (AniList only gives one hop, so a long franchise may need a click through to the next title).
- Episode list: "Hide filler" toggle (remembered; never hides the episode you are on).
- Phones: bottom navigation bar (Home, Search, My list, Schedule, Library) with a download badge. Hidden on the watch pages.
- Pull-to-refresh on touch devices. Home, search and schedule reload just their own data; other pages reload the app.
- Back/Forward restores your scroll position. New pages start at the top.
- Errors (home, search, schedule, anime page) show "Retry now (auto in 30s)". Rate-limit errors retry on their own up to 3 times.
- Anime page shows a skeleton while loading instead of "Loading…".
- Accessibility: skip-to-content link, consistent focus rings, 44px touch targets on phones.
- Files: src/ui/* (BottomNav, PullToRefresh, ScrollMemory, RetryButton, SkipLink), src/discover/RelatedList.jsx, src/styles/components/mobile-ui.css
