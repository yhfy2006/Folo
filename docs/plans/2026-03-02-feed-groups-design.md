# Feed Groups Design

**Date:** 2026-03-02
**Status:** Approved

## Goal

Enable feed grouping so different topics generate separate daily newsletters. Each OPML import creates a group. Each group can have its own language, report style, interests, time range, and pipeline schedule, falling back to global preferences when not configured.

## Data Model

### New table: `feed_groups`

```sql
CREATE TABLE IF NOT EXISTS feed_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT,
  report_style TEXT,
  interests TEXT,          -- JSON array, e.g. '["AI", "crypto"]'
  time_range INTEGER,
  pipeline_schedule TEXT,  -- HH:mm format, independent per group
  created_at INTEGER NOT NULL
);
```

### New junction table: `feed_group_feeds`

Many-to-many relationship — a feed can belong to multiple groups.

```sql
CREATE TABLE IF NOT EXISTS feed_group_feeds (
  group_id TEXT NOT NULL REFERENCES feed_groups(id),
  feed_id TEXT NOT NULL REFERENCES feeds(id),
  PRIMARY KEY (group_id, feed_id)
);
```

### Altered table: `reports`

```sql
ALTER TABLE reports ADD COLUMN group_id TEXT REFERENCES feed_groups(id);
```

- `group_id = NULL` means a global report (backward compatible with existing data).

### No change to `feeds` table

The existing `category` field is preserved for within-group folder organization.

## OPML Import Flow

Current: open file → parse → insert feeds → refreshAllFeeds

New:

1. User clicks "Import OPML"
2. Dialog prompts for group name (default: OPML filename without extension)
3. Parse OPML, INSERT OR IGNORE all feeds
4. Create `feed_groups` record with the given name
5. INSERT into `feed_group_feeds` to associate all parsed feeds with the new group
6. `refreshAllFeeds()`

If a feed URL already exists, the existing feed row is reused but still linked to the new group (many-to-many).

## Pipeline Changes

### `runPipeline(options)` accepts optional `groupId`

- **With groupId:** Query entries only from feeds linked to that group via `feed_group_feeds`. Use group-level config with fallback to global preferences.
- **Without groupId:** Query all feeds' entries. Use global config. Backward compatible.

### Config resolution

```
effective.language     = group.language     ?? prefs.language
effective.reportStyle  = group.report_style ?? prefs.reportStyle
effective.interests    = group.interests    ?? prefs.interests
effective.timeRange    = group.time_range   ?? prefs.timeRange
```

### Report generation

- `generateReport` receives `groupId`, filters entries via JOIN on `feed_group_feeds`.
- Report title includes group name, e.g. "AI Morning Report - 2026-03-02".
- Saved with `group_id` in `reports` table.
- Entry dedup via `report_entries` still works per-entry (an entry used in Group A's report can still appear in Group B's).

### Podcast & downstream stages

- `generatePodcastScript` receives `groupId`, uses the group's report.
- Audio, publish, video, YouTube stages all operate on the group's artifacts.

### Publishing

- Shared GitHub repo / YouTube channel config (global).
- Each group's content published to a distinct path: `/{group-name}/YYYY-MM-DD.html`.

## Scheduler Changes

- Each group with a non-null `pipeline_schedule` gets its own `setTimeout`-based timer.
- Global `pipelineSchedule` in preferences continues to control ungrouped pipeline (or can be disabled).
- `initPipelineScheduler` reads all groups and sets up timers.
- When a group's schedule is updated, its timer is reset.

## UI Changes

### Sidebar

- Top-level section shows group list.
- Clicking a group filters to its feeds/entries.
- "All" option shows everything (current behavior).

### Group management

- Group settings panel: edit name, language, report style, interests, schedule.
- Add/remove feeds from a group.

### Pipeline panel

- Dropdown to select which group to run pipeline for.
- Per-group last-run status display.

## Migration

- On app startup, run CREATE TABLE IF NOT EXISTS for new tables.
- ALTER TABLE reports ADD COLUMN group_id (IF NOT EXISTS pattern).
- Existing data remains untouched (no group_id = global).
