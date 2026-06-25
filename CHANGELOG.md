# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-06-17

### Added
- Interactive reader app (`reader.html`) with sidebar navigation, search, prev/next
- Landing page (`index.html`) with guide list
- Achievement panel with inline badges, missable warnings, upcoming cutoff alerts
- Type filter buttons (All / Missable / Story / Challenge / Secret / Progress / Collectible)
- Interactive checkboxes with localStorage progress persistence
- Achievement detail modal
- Ongoing Achievements table
- Service worker for offline support (`sw.js`)
- CSP headers on all pages
- Vendored `marked.js` for client-side markdown rendering

### Guides
- Phantasy Star IV (RetroAchievements)
- Final Fantasy V Advance (RetroAchievements)
- Chrono Cross (RetroAchievements)
- Dragon Warrior I & II (RetroAchievements)

### Changed
- Replaced inline nav bars with reader-driven navigation
- Reader handles .md link interception via event delegation
- ESM import for marked.js
- Stub folder nodes in TOC hierarchy restored
- Sidebar closes immediately on TOC click
- Mobile code blocks use scroll (not break-word) for ASCII art preservation

### Fixed
- Corrected author attribution for Dragon Warrior I & II
- Sub-header labels reformatted as bold text
- Broken CSS braces in reader
- CNAME and .nojekyll handling for custom domain + Jekyll disable

### Removed
- No longer tracks generated walkthrough section files in root
