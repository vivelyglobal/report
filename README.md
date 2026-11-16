# Vively Campaign Report

Static, responsive campaign dashboard styled after the Vively KAINE reference report. Serve this directory with any static server, or publish it through the repository's existing GitHub Pages workflow. No build or dependencies are required.

Enter a brand name and a Google Sheets tab URL. The sheet must be readable by anyone with the link. Existing report URLs using `?brand=…&sheet=…&gid=…` are supported, including the legacy `name` alias and default sheet when only `gid` is supplied.

## Sheet contract

The first row must contain these exact column names (in any order):

```
post_url, posted_date, likes, comments, views, reposts, post_er
```

Each nonempty `post_url` row counts as one post. Only HTTP(S) URLs become clickable links. No creator identity is inferred. Qualitative analysis is stored separately from the seven source columns; the sheet schema stays unchanged.

Numeric cells accept comma-separated values; missing/invalid values display as `—` and are excluded from aggregates. ER uses the arithmetic mean of valid `post_er` cells. Google Sheets percent-formatted values use their displayed percentage (e.g. numeric `0.045` formatted as `4.50%`). Plain numbers without percent formatting are percentage points (`4.5` means `4.5%`); strings such as `4.5%` are also accepted. ER is never substituted with an engagement/views calculation.

Dates accept Google Visualization date cells or year-first dates (`YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD`). Invalid dates remain in the post table and KPI totals but are excluded from the timeline. Timeline values group current cumulative post metrics by posting date; they do not represent historical daily changes. Missing metric values produce gaps rather than false zeroes.

The report includes six KPIs, the top three posts with valid views, a date-based chart with four metric choices, URL search, sortable columns, CSV export, link copying, refresh, keyboard-accessible tabs, and print styles. Exports include all loaded posts in the seven-column schema, with ER in percentage points. No sample campaign data is shown. The KAINE source uses an unformatted ratio in post_er, confirmed from its formula; the source-specific profile converts this ratio to percentage points. Other sheets keep the documented percentage-point default.

## Validation

JavaScript syntax and fixture-based parsing/rendering checks cover reordered headers, header-row detection, percentage formats, invalid dates, missing metrics, repost totals, arithmetic ER, safe links, escaping, and empty report rendering. Public Google Visualization connectivity has been verified against the KAINE tab supplied on 2026-11-16. Checks against its 26 live rows confirmed 252,573 views, 57 reposts and 1.44% mean ER after ratio conversion. Browser visual verification was unavailable in this session.

## 핵심 내용: caption collection and review

The 핵심 내용 tab joins external evidence to Instagram reel/post URLs. It shows verified captions, hashtags, reviewer-authored summaries and evidence, and explicitly labeled performance hypotheses. Until collection/review is performed, each post displays its true pending status. Access failures are not replaced with invented summaries. View counts alone cannot establish why a video went viral.

Collect accessible public metadata outside the static browser page:

```sh
python3 scripts/enrich_reels.py --sheet YOUR_SHEET_ID --gid YOUR_TAB_ID
```

The standard-library collector reads the CSV export, deduplicates Instagram URLs, checks them sequentially with a delay, and writes `reel-insights.js`. It does not bypass logins, download videos, watch videos, or generate qualitative analysis. Instagram may block public requests. Collection is an explicit refresh step; loading or refreshing the static report updates sheet metrics only. Serving the app alone does not run this collector.

Add reviewed findings to `reel-reviews.js`, using the same `sheet` and `gid`. Each `posts` record has `post_url`, ISO `checked_at`, `summary`, `evidence`, `video_reviewed`, and `hypotheses` (an array). Only mark `video_reviewed` true after actually watching the video. Metadata collection does not overwrite reviews. The dashboard ignores evidence from other sheet tabs and matches URLs without tracking query parameters. For live automatic collection and analysis on sheet changes, a server or scheduled worker and a suitable Instagram data source must be configured separately.

### Logo asset

`assets/vively-logo.png` is the transparent logo used in the header, created with the built-in image generation tool from the supplied screenshot. Prompt: remove only the white background (including enclosed areas), preserve the dark brown symbol and exact lowercase “vively” geometry, spacing, proportions and color; no redesign, added text, shadows, gradients or border; true alpha PNG cropped around the complete logo.

## KAINE review · 2026-11-16

The supplied KAINE tab (`gid=141019346`) contains 26 Instagram post URLs. Every URL was requested individually. Public `og:description` metadata exposed a quoted caption excerpt for all 26; those excerpts, extracted hashtags and per-post collection timestamps are saved in `reel-insights.js`. Metadata can truncate captions, and its current likes/comments can differ from the sheet snapshot; KPI metrics continue to use the sheet exclusively.

`reel-reviews.js` contains 26 Korean summaries, supporting observations and caption-based performance hypotheses, plus three campaign findings with source links. No video was watched, and no claims about hooks, visuals, editing, music or audience retention were made. Every review is marked `video_reviewed: false` and labeled accordingly in the UI. The 2026-11-16 findings describe rankings at review time; refreshed metrics can change afterward. They establish neither viral causality nor a generalizable performance benchmark.

The collector recognizes English/Arabic-style quoted metadata and Japanese quoted-caption metadata. Text recovered from metadata is explicitly labeled as an excerpt, rather than a complete verified caption. Reviewed content remains a dated enrichment snapshot; automatic sheet refresh updates quantitative metrics only.

## DR.PEPTI and multi-campaign retention · 2026-11-16

DR.PEPTI (`gid=1748021858`) now has 26 collected caption excerpts, hashtags and caption-based reviews, plus three campaign findings. Its percent-formatted ER cells use their formatted percent display; validation confirmed 238,873 total views and 1.33% mean ER. All reviews explicitly mark video as unreviewed.

Both evidence files now use `{campaigns: [...]}`. The collector upserts only the requested sheet/tab and retains other campaigns. The report selects matching records by spreadsheet ID and gid; switching brands no longer requires replacing the single stored campaign. KAINE retains its 26 reviews. New campaigns still need collection and review before qualitative analysis is available; the static report does not start server-side scraping on page load.

The visible 데이터 소스 card and direct Google Sheets link were removed from the report. This is a presentation change, not an access-control feature: sheet IDs remain in the report URL and browser requests. Concealing source credentials or restricting source access requires a backend rather than a direct public-sheet integration.
