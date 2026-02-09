# PostHog Analytics Events

This document lists all PostHog events tracked across the Reelify application, including where they fire and what properties they carry.

---

## User Identification

| Action                                        | Location                           | Details                                           |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `posthog.identify(userId)`                    | Login page on success              | Associates all future events with the user        |
| `posthog.identify(id, { credits_remaining })` | Home page on mount (via `/api/me`) | Re-identifies returning users with latest credits |
| `posthog.reset()`                             | Home page on logout                | Clears identity for the next session              |

---

## Login (`app/login/page.tsx`)

| Event             | Trigger                          | Properties      |
| ----------------- | -------------------------------- | --------------- |
| `login_attempted` | User submits the login form      | —               |
| `login_succeeded` | User ID validated successfully   | —               |
| `login_failed`    | Invalid user ID or network error | `error_message` |

---

## Home Page (`app/[locale]/page.tsx`)

### Upload & Form

| Event               | Trigger                                             | Properties                                      |
| ------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `video_uploaded`    | File validated, transitioning to form screen        | `file_size_mb`, `duration_seconds`, `file_type` |
| `platform_selected` | User picks a platform (step 1)                      | `platform`, `recommended_duration`              |
| `duration_selected` | User picks a clip duration (step 2)                 | `duration_seconds`, `platform`                  |
| `questions_skipped` | User enables "skip questions" and starts processing | `platform`, `preferred_duration`                |

### Processing

| Event                  | Trigger                      | Properties                                                                                              |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `processing_started`   | Conversion begins            | `platform`, `preferred_duration`, `audience`, `tone`, `hook_style`, `source_duration_seconds`, `locale` |
| `processing_completed` | Clips generated successfully | `platform`, `clips_generated`, `source_duration_seconds`                                                |
| `processing_failed`    | Processing errors out        | `error_message`, `platform`, `source_duration_seconds`                                                  |

### Results

| Event             | Trigger                                 | Properties                                              |
| ----------------- | --------------------------------------- | ------------------------------------------------------- |
| `clip_previewed`  | User clicks a clip card to open preview | `clip_index`, `clip_title`, `clip_duration`, `category` |
| `user_logged_out` | User confirms logout                    | —                                                       |

---

## Preview Page (`app/[locale]/preview/page.tsx`)

| Event                   | Trigger                                 | Properties                                                              |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `preview_opened`        | Page mounts                             | `title`, `clip_duration`, `has_transcript`, `has_thumbnail`, `category` |
| `edit_clicked`          | User clicks "Edit Video" button         | `title`, `clip_duration`                                                |
| `thumbnail_downloaded`  | User downloads the thumbnail image      | `title`                                                                 |
| `transcript_downloaded` | User downloads the transcript text file | `title`, `transcript_length`                                            |

---

## Editor Page (`app/[locale]/editor/page.tsx`)

| Event           | Trigger                             | Properties                                                           |
| --------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `editor_opened` | Clip data loaded and editor renders | `clip_duration`, `has_transcription`, `transcription_segments_count` |

---

## Export Panel (`components/reel-editor/ExportPanel.tsx`)

### Export (local rendering)

| Event              | Trigger                         | Properties                                                              |
| ------------------ | ------------------------------- | ----------------------------------------------------------------------- |
| `export_started`   | Video export begins             | `include_captions`, `export_format`, `captions_count`, `video_duration` |
| `export_completed` | Video export succeeds           | `include_captions`, `export_format`, `video_duration`                   |
| `export_failed`    | Video export errors             | `error_message`, `export_format`                                        |
| `video_downloaded` | User downloads the exported MP4 | `include_captions`, `export_format`, `video_duration`                   |

### Publish (to social platforms)

| Event             | Trigger                            | Properties                                      |
| ----------------- | ---------------------------------- | ----------------------------------------------- |
| `publish_started` | Publishing to a platform begins    | `platform`, `include_captions`, `export_format` |
| `video_published` | Successfully published to platform | `platform`, `include_captions`, `export_format` |
| `publish_failed`  | Publishing errors                  | `platform`, `error_message`                     |

---

## Admin Page (`app/admin/page.tsx`)

| Event                | Trigger                             | Properties                                   |
| -------------------- | ----------------------------------- | -------------------------------------------- |
| `admin_logged_in`    | Admin authenticates with the secret | —                                            |
| `admin_user_created` | Admin creates a new user            | `credits_initial`                            |
| `admin_user_updated` | Admin edits a user                  | `user_id`, `credits_before`, `credits_after` |
| `admin_user_deleted` | Admin deletes a user                | `user_id`                                    |

---

## Key Funnels to Track in PostHog

1. **Upload → Conversion funnel**: `video_uploaded` → `processing_started` → `processing_completed` → `clip_previewed`
2. **Preview → Export funnel**: `preview_opened` → `export_started` → `export_completed` → `video_downloaded`
3. **Preview → Publish funnel**: `preview_opened` → `export_started` → `publish_started` → `video_published`
4. **Edit flow**: `clip_previewed` → `editor_opened` → `export_started` → `video_downloaded`
5. **Login flow**: `login_attempted` → `login_succeeded` → `video_uploaded`
