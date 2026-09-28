# Tennis Tracker - Tennis Scorekeeper & Match Stats PWA

A mobile-first tennis match tracker for point-by-point scoring, singles and doubles statistics, and courtside review. Save matches in your browser and keep scoring offline after the app has been cached.

**[Open the live app](https://tennis-tracker-lyart.vercel.app/)** · [Quick start](#quick-start) · [Features](#features) · [Run locally](#run-locally) · [中文指南](#中文指南)

No account or backend required. For players reviewing practice matches, coaches tracking patterns, and friends or parents keeping score courtside: record how points end, not just the final score.

## Quick start

1. Open the **[live app](https://tennis-tracker-lyart.vercel.app/)** while online. Choose **Singles Match** or **Doubles Match**.
2. Enter the player names, choose **Ad Scoring** or **No-Ad Scoring**, and select the first server. For doubles, also select the first receiver, then follow the rotation prompts as play progresses. Tap **Start Match**.
3. Select the serve result and point winner, add any shot or rally details you know, then tap **Submit Point**. Aces and double faults assign the point winner automatically; uncertain details can stay unset.
4. Use **History** to correct entries, **Stats** to review the match, and **Matches** to reopen saved matches. In the **Live** tab, use **Export JSON** to save a copy outside your browser.

Scoring is manual: you enter each point, and the app calculates the score and statistics. It does not track the ball or analyze video.

## Features

| Feature | What you can do |
| --- | --- |
| Singles and doubles scoring | Track points, games, sets, tiebreaks, and the current server; choose Ad or No-Ad scoring. |
| Point-by-point match logging | Record first/second serves, aces, double faults, winners, unforced errors (UE), forced errors (FE), shot types, preceding shots, rally length, and net involvement. |
| Tennis match statistics | Review serve percentages, serve/return points won, shot breakdowns, net points, break points, and short/long rally results, per set and overall. |
| Doubles analysis | Track four players, serving order, receiving formation, team statistics, and individual player statistics. |
| Correctable match history | Browse by set and game, edit or delete entries, flag points for review, exclude points from statistics without removing them from scoring, or use **Adjust Score** to add a checkpoint. |
| Import and export | Download JSON or CSV, import this app's exports, and use the device share sheet where supported. |

Return-shot statistics are derived from entries whose preceding shot is marked as a serve (**Srv** in the point form). More detailed point entries produce more useful analysis; unrecorded or uncertain details are not a substitute for observed play.

### Supported scoring format

The current format is **two standard sets, with a deciding match tiebreak at one set all**. Standard sets have a 7-point tiebreak at 6-6; the deciding match tiebreak is first to 10. Both tiebreaks require a two-point lead. Ad and No-Ad scoring are selectable for games.

A full third set and other match formats are not currently configurable.

## Install and use offline

The app includes a web app manifest and a cache-first service worker for Progressive Web App (PWA) use.

1. Visit the app over **HTTPS** while connected to the internet and let it finish loading.
2. If your browser offers it, choose **Install app** or **Add to Home Screen**. On iPhone/iPad, look for **Add to Home Screen** in Safari's share menu. Availability depends on the browser and device; installation is optional.
3. Before going courtside, reopen the same URL or installed app without a connection and confirm that it loads.

**Offline support needs an online first visit.** The service worker caches the app shell and attempts to cache Tailwind CSS, Dexie, and font resources from their CDNs. Blocked requests, an incomplete initial cache, or browser cache eviction can prevent offline use. Reconnect and reload if assets are missing.

Use HTTPS for a hosted deployment, or `localhost` for local development. Opening `index.html` directly with `file://` does not provide the service-worker setup.

## Your data and backups

**Matches stay in IndexedDB in the browser you use.** Dexie manages the database; `localStorage` remembers the active match. There is no app account, backend database, or automatic cloud/device sync.

Storage is tied to the browser profile and site origin (scheme, host, and port). A different device, browser, domain, or local port will not automatically see your matches. Clearing site data, using private browsing, or browser storage eviction can remove records. **Export important matches regularly.**

| Action | Behavior and limits |
| --- | --- |
| **Export JSON** | Recommended for keeping a match record: includes point entries, score-adjustment checkpoints, scoring settings, doubles configuration, and calculated statistics. |
| **Export CSV** | Point rows for spreadsheets and analysis. Does not preserve score-adjustment checkpoints or the Ad/No-Ad setting, so it is not a full-fidelity backup. |
| **Import Match** | Available on the setup screen and in **Matches**; accepts this app's JSON/CSV format, not arbitrary spreadsheets. Creates a new match with a new ID and import-time match date. CSV imports use Ad scoring. |
| **Share** | Shares a JSON file when file sharing is supported. Otherwise, the app may share only title/text or report that sharing is unavailable; download JSON for a reliable file copy. |

The app code does not automatically upload match records. The hosted site and external services still receive normal asset requests: Tailwind CSS comes from `cdn.tailwindcss.com`, Dexie from `unpkg.com`, and fonts from Google Fonts. Local storage does not mean the initial page load makes no external network requests. Exported files contain player names and match details; share them intentionally.

## Run locally

There is **no npm install or build step**. You need Git, Python 3 (for the example static server), and a modern browser with JavaScript and IndexedDB enabled.

```sh
git clone https://github.com/keeea/tennis-tracker.git
cd tennis-tracker
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://localhost:8000/** while online so the CDN dependencies can load. Keep using the same hostname and port to access the same locally stored matches. Stop the server with `Ctrl+C`.

Python is only serving static files; it is not an application backend. Any equivalent static HTTP server works.

## Deploy

Serve the repository root as a static site over HTTPS. Keep `index.html`, `app.js`, `manifest.json`, `sw.js`, and `icons/` together at their relative paths. No server-side database, API keys, or environment variables are needed.

For Vercel, import the repository, choose the **Other** framework preset, enable the **Build Command** override and leave it empty, and serve the repository root (`.`) as the output directory. No install command is needed. Other static hosts work with the same files; for GitHub Pages, enable a Pages deployment from the repository root.

When changing app assets, update `CACHE_NAME` in `sw.js` so the cache-first service worker installs a fresh asset cache. Clearing site data is not a safe update strategy unless you have exported your matches first.

## Development

The stack is **vanilla JavaScript, HTML/CSS, Tailwind CSS via CDN, Dexie 4.0.8 over IndexedDB, and native service-worker/manifest APIs**. There is no package manager manifest or bundled build pipeline.

| File | Purpose |
| --- | --- |
| [`index.html`](index.html) | App shell, styles, fonts, and CDN script loading. |
| [`app.js`](app.js) | Scoring, UI, match statistics, persistence, and import/export. |
| [`sw.js`](sw.js) | App and external-resource caching for offline use. |
| [`manifest.json`](manifest.json) | PWA name, start URL, display mode, and icons. |
| [`icons/`](icons/) | SVG app icons. |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | Original project brief; some details differ from the current implementation, including the match format. |

Found a scoring edge case or an improvement? [Open an issue](https://github.com/keeea/tennis-tracker/issues) with the match type, Ad/No-Ad setting, score before the point, reproduction steps, expected result, and browser/device. Remove personal information from any attached exports.

For a contribution, fork the repository, run it locally, keep the change focused, and open a pull request describing its behavior. Check singles/doubles scoring, edits, imports/exports, and offline loading as relevant to your change.

This repository currently has no license file; do not assume a particular reuse license.

## 中文指南

**Tennis Tracker 是一款面向球场边记录与赛后复盘的网球逐分记分 PWA**，支持单打、双打、逐分记录、每盘与全场统计，以及 JSON/CSV 导入导出。适合球员、教练和帮忙记分的亲友；不是自动识球、视频分析或训练计划工具。当前应用界面为英文。

**[打开在线应用](https://tennis-tracker-lyart.vercel.app/)** · [本地运行](#run-locally) · [离线与安装](#install-and-use-offline) · [数据与备份](#your-data-and-backups)

1. 首次联网打开应用，选择 **Singles Match**（单打）或 **Doubles Match**（双打），填写姓名、计分方式和首位发球者；双打还需选择首位接发球者，再点 **Start Match**。
2. 每分选择发球结果和得分方，按需补充制胜分、失误、击球方式等信息，点 **Submit Point**。通过 **History** 修改记录，在 **Stats** 查看统计，在 **Matches** 重新打开已保存的比赛。
3. 比赛采用两盘制，盘分 1-1 后抢十；普通盘 6-6 抢七，抢七和抢十均需净胜两分。可选占先（Ad）或无占先（No-Ad），暂不支持完整第三盘。
4. 在 **Live** 页使用 **Export JSON** 备份，使用 **Import Match** 导入为新比赛。CSV 适合表格分析，但不保留比分调整节点和无占先设置，不能替代完整备份。

**数据只保存在当前浏览器和站点中，不会自动云同步。** 清理网站数据、无痕浏览或浏览器回收存储可能导致记录丢失，请定期导出 JSON。导入会生成新比赛 ID，并以导入时间作为比赛日期。离线使用需先联网缓存成功；到球场前请断网重开确认可用。浏览器支持时可安装到主屏幕。

---

If Tennis Tracker helps you keep score or understand your game, consider giving the repository a **Star** so more tennis players can discover it.
