# Personal Productivity Planner

A full-stack personal planning system built with React, TypeScript, Vite, Express, and Recharts. The central planner is the single source of truth for study sessions, workouts, internship days, homework due dates, and general events.

## Features

- Month, week, and day calendar views with event CRUD and completion tracking.
- Synchronized study subjects/sessions, workout plans, internship hours, and homework tasks.
- Persistent recurring workout templates with exercise plans, week navigation, scheduled instances, and workout logs.
- Dashboard overview with today's schedule, progress, upcoming plans, and quick actions.
- Filtered analytics charts for weekly hours, planned vs actual time, study subjects, completion, activity distribution, and monthly progress.
- JSON persistence under `data/`; records survive browser and server restarts.

## Run locally

Install dependencies if needed:

```powershell
npm install
npm --prefix frontend install
```

Build the frontend and start the full application:

```powershell
npm run build
npm start
```

Open `http://localhost:5000`. Express serves the production frontend and all `/api` routes from the same origin.

For development with hot reload, run these in separate terminals:

```powershell
npm run dev
npm --prefix frontend run dev
```

Vite proxies `/api` requests to Express on port `5000`.

## Frontend structure

- `src/components/` contains calendar, dashboard, analytics, and domain editors.
- `src/hooks/` owns shared planner and productivity state.
- `src/services/` contains the API boundary.
- `src/types/` defines planner and domain records.
- `src/utils/` contains date and analytics calculations.
- `src/pages/` composes route-level workflows.

## Persistence model

Every planned domain record references one central `eventId`:

- `data/events.json`
- `data/study-subjects.json`
- `data/study-sessions.json`
- `data/workouts.json`
- `data/workout-templates.json`
- `data/workout-schedules.json`
- `data/workout-logs.json`
- `data/internship-days.json`
- `data/homework-tasks.json`

Creating or editing a domain record updates its calendar event. Editing, completing, or deleting a linked calendar event propagates back to its domain record.

Recurring gym schedules use the ISO weekday convention: `1` is Monday and `7` is Sunday. Scheduled workout IDs are derived from `templateId + dayOfWeek + date`, so generating the same date range repeatedly is idempotent. Only requested/default date windows are generated; the application does not create infinite future records.

Gym activity sessions may include a valid `workoutId`. Completing a scheduled workout writes both a detailed workout log and a linked legacy Gym session, preserving compatibility with the existing activity/Pomodoro data.

## Workout API

- `GET|POST /api/workout-templates`
- `PUT|DELETE /api/workout-templates/:id`
- `GET /api/workout-schedule?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET|POST /api/workouts`
- `PUT|DELETE /api/workouts/:id`
- `POST /api/workouts/:id/complete`
- `GET /api/workout-logs`
- `GET /api/workouts/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD`

## Checks

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
```
