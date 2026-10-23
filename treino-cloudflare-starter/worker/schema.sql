PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS workout_sessions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 activity_type TEXT NOT NULL CHECK(activity_type IN ('ginásio','dança','corrida','caminhada','ciclismo','mobilidade','outro')),
 session_date TEXT NOT NULL,
 start_time TEXT, end_time TEXT,
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
 intensity TEXT NOT NULL DEFAULT 'moderada' CHECK(intensity IN ('leve','moderada','intensa')),
 distance_km REAL CHECK(distance_km IS NULL OR distance_km >= 0),
 notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON workout_sessions(session_date DESC);
CREATE TABLE IF NOT EXISTS workout_exercises (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
 exercise_name TEXT NOT NULL,
 sets INTEGER, reps TEXT NOT NULL DEFAULT '', weight_kg REAL, effort_rir INTEGER,
 notes TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exercises_session ON workout_exercises(session_id, sort_order);
