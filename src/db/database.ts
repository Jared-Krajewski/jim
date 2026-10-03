import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  // Cache the in-flight open+init promise, not just the resolved db, so
  // concurrent early callers (e.g. root layout + a context effect both
  // calling this on mount) await the same open/migration instead of each
  // opening their own connection and racing initDatabase() against it.
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync("gymapp.db");
      await initDatabase(database);
      db = database;
      return database;
    })().catch((e) => {
      // Don't cache a failed open/migration — let the next caller retry.
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function initDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL DEFAULT '',
      notes TEXT DEFAULT '',
      default_weight REAL NOT NULL DEFAULT 0,
      default_unit TEXT NOT NULL DEFAULT 'lbs',
      default_reps INTEGER NOT NULL DEFAULT 10,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      default_sets INTEGER NOT NULL DEFAULT 3,
      default_reps INTEGER NOT NULL DEFAULT 10,
      default_weight REAL NOT NULL DEFAULT 0,
      default_unit TEXT NOT NULL DEFAULT 'lbs',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      completed_at INTEGER,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS session_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      reps INTEGER NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0
    );
  `);

  const verRow = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const version = verRow?.user_version ?? 0;

  // A newer build already migrated this DB (e.g. TestFlight → App Store
  // downgrade). Leave it alone rather than risk rewriting its data.
  if (version > SCHEMA_VERSION) return;

  // Snapshot an existing DB before changing it, so a bad migration in an
  // update can never cost the user their history. Fresh installs (v0) have
  // nothing to protect.
  if (version >= 1 && version < SCHEMA_VERSION) {
    await backupDatabase(database, `pre-v${SCHEMA_VERSION}`);
  }

  // Columns added after the tables first shipped. Fresh installs already
  // have them from CREATE TABLE above; older DBs get them added here.
  await database.withTransactionAsync(async () => {
    await addColumnIfMissing(database, "exercises", "default_weight", "REAL NOT NULL DEFAULT 0");
    await addColumnIfMissing(database, "exercises", "default_unit", "TEXT NOT NULL DEFAULT 'lbs'");
    await addColumnIfMissing(database, "exercises", "default_reps", "INTEGER NOT NULL DEFAULT 10");
    await addColumnIfMissing(database, "template_exercises", "default_weight", "REAL NOT NULL DEFAULT 0");
    await addColumnIfMissing(database, "template_exercises", "default_unit", "TEXT NOT NULL DEFAULT 'lbs'");
    await addColumnIfMissing(database, "workout_templates", "sort_order", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(database, "session_sets", "done_at", "INTEGER");
  });

  // Versioned data migrations. Each step runs in a transaction together
  // with its user_version bump, so it either fully applies or not at all.
  // Only ever append steps here — never edit or reorder shipped ones.
  if (version < 1) {
    // Seed exercises on first launch.
    await database.withTransactionAsync(async () => {
      await seedExercisesIfEmpty(database);
      await database.execAsync("PRAGMA user_version = 1");
    });
  }
  if (version < 2) {
    // Session dates used to be written in UTC, which dated evening workouts
    // as the next day. Re-derive every date from its start time in local
    // time (dates are only ever set from the start time at creation).
    await database.withTransactionAsync(async () => {
      await database.execAsync(
        `UPDATE workout_sessions SET date = date(started_at, 'unixepoch', 'localtime');
         PRAGMA user_version = 2;`,
      );
    });
  }
}

/** Latest schema version. Bump this when appending a migration step. */
const SCHEMA_VERSION = 2;

async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const cols = await database.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  if (cols.some((c) => c.name === column)) return;
  await database.execAsync(
    `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
  );
}

/** Writes a consistent copy of the DB next to it (e.g. gymapp.pre-v2.db).
 *  An existing backup with the same name is kept: it's from an earlier
 *  attempt at this same migration and is the more pristine copy. */
async function backupDatabase(
  database: SQLite.SQLiteDatabase,
  label: string,
): Promise<void> {
  const dbPath = database.databasePath.replace(/^file:\/\//, "");
  const backupPath = dbPath.replace(/\.db$/, "") + `.${label}.db`;
  try {
    await database.runAsync("VACUUM INTO ?", [backupPath]);
  } catch (e) {
    // Most likely the backup already exists. Either way, don't block the
    // app from opening — the migrations themselves are transactional.
    console.warn("Database backup skipped:", e);
  }
}

// Module-level exercise seed list
const SEED_EXERCISES: [string, string][] = [
  // Chest
  ["Barbell Bench Press", "Chest"],
  ["Dumbbell Bench Press", "Chest"],
  ["Incline Barbell Bench Press", "Chest"],
  ["Incline Dumbbell Bench Press", "Chest"],
  ["Decline Barbell Bench Press", "Chest"],
  ["Decline Dumbbell Bench Press", "Chest"],
  ["Chest Press Machine", "Chest"],
  ["Incline Machine Press", "Chest"],
  ["Hammer Strength Chest Press", "Chest"],
  ["Smith Machine Bench Press", "Chest"],
  ["Cable Crossover (High to Low)", "Chest"],
  ["Cable Crossover (Low to High)", "Chest"],
  ["Dumbbell Chest Fly", "Chest"],
  ["Incline Dumbbell Fly", "Chest"],
  ["Pec Deck Machine", "Chest"],
  ["Weighted Dips (Chest Focus)", "Chest"],
  ["Push-Up", "Chest"],
  ["Incline Push-Up", "Chest"],
  ["Decline Push-Up", "Chest"],
  ["Diamond Push-Up", "Chest"],
  ["Plyometric (Clap) Push-Up", "Chest"],
  ["Floor Press (Dumbbell/Barbell)", "Chest"],
  ["Svend Press", "Chest"],
  ["Landmine Chest Press", "Chest"],
  ["Cable Chest Press", "Chest"],
  // Back
  ["Deadlift (Conventional)", "Back"],
  ["Barbell Bent-Over Row", "Back"],
  ["Dumbbell Single-Arm Row", "Back"],
  ["Lat Pulldown (Wide Grip)", "Back"],
  ["Lat Pulldown (Close Grip)", "Back"],
  ["Seated Cable Row", "Back"],
  ["T-Bar Row", "Back"],
  ["Pull-Up", "Back"],
  ["Chin-Up", "Back"],
  ["Assisted Pull-Up Machine", "Back"],
  ["Rack Pulls", "Back"],
  ["Chest-Supported Row", "Back"],
  ["Meadows Row", "Back"],
  ["Seal Row", "Back"],
  ["Pendlay Row", "Back"],
  ["Straight-Arm Cable Pulldown", "Back"],
  ["Face Pull", "Back"],
  ["Reverse Fly (Dumbbell/Machine)", "Back"],
  ["Hyperextension (Back Extension)", "Back"],
  ["Good Mornings", "Back"],
  ["Renegade Row", "Back"],
  ["Inverted Row", "Back"],
  ["Smith Machine Row", "Back"],
  ["Pullover (Dumbbell/Cable)", "Back"],
  ["V-Bar Pulldown", "Back"],
  // Shoulders
  ["Overhead Press (Barbell/Standing)", "Shoulders"],
  ["Seated Military Press", "Shoulders"],
  ["Dumbbell Shoulder Press", "Shoulders"],
  ["Arnold Press", "Shoulders"],
  ["Dumbbell Lateral Raise", "Shoulders"],
  ["Cable Lateral Raise", "Shoulders"],
  ["Machine Lateral Raise", "Shoulders"],
  ["Front Raise (Dumbbell/Plate/Cable)", "Shoulders"],
  ["Rear Delt Fly (Dumbbell/Cable)", "Shoulders"],
  ["Upright Row (Barbell/Dumbbell)", "Shoulders"],
  ["Push Press", "Shoulders"],
  ["Smith Machine Overhead Press", "Shoulders"],
  ["Landmine Press", "Shoulders"],
  ["Pike Push-Up", "Shoulders"],
  ["Handstand Push-Up", "Shoulders"],
  ["Barbell Shrug", "Shoulders"],
  ["Dumbbell Shrug", "Shoulders"],
  ["Smith Machine Shrug", "Shoulders"],
  ["Bradford Press", "Shoulders"],
  ["Bus Driver (Plate Rotation)", "Shoulders"],
  ["W-Press", "Shoulders"],
  ["Cuban Press", "Shoulders"],
  ["High Pull", "Shoulders"],
  ["Viking Press", "Shoulders"],
  ["Scaption (Y-Raise)", "Shoulders"],
  // Biceps
  ["Barbell Curl", "Biceps"],
  ["EZ-Bar Curl", "Biceps"],
  ["Dumbbell Bicep Curl", "Biceps"],
  ["Hammer Curl", "Biceps"],
  ["Alternating Dumbbell Curl", "Biceps"],
  ["Preacher Curl (Barbell/Dumbbell)", "Biceps"],
  ["Concentration Curl", "Biceps"],
  ["Cable Bicep Curl", "Biceps"],
  ["Incline Dumbbell Curl", "Biceps"],
  ["Spider Curl", "Biceps"],
  ["Bayesian Curl", "Biceps"],
  ["Drag Curl", "Biceps"],
  ["Rope Cable Curl", "Biceps"],
  ["Machine Bicep Curl", "Biceps"],
  ["Kettlebell Curl", "Biceps"],
  ["Reverse Grip Barbell Curl", "Biceps"],
  ["Single-Arm Cable Curl", "Biceps"],
  ["Overhead Cable Curl (Hercules Curl)", "Biceps"],
  ["Plate Curl", "Biceps"],
  // Triceps
  ["Close-Grip Bench Press", "Triceps"],
  ["Tricep Pushdown (Cable/Rope)", "Triceps"],
  ["Tricep Pushdown (Straight Bar)", "Triceps"],
  ["Skull Crushers (Barbell/Dumbbell)", "Triceps"],
  ["Overhead Tricep Extension (Dumbbell)", "Triceps"],
  ["Overhead Tricep Extension (Cable)", "Triceps"],
  ["Tricep Dips (Bench/Parallel Bars)", "Triceps"],
  ["Dumbbell Kickback", "Triceps"],
  ["Cable Kickback", "Triceps"],
  ["JM Press", "Triceps"],
  ["Machine Tricep Extension", "Triceps"],
  ["Tate Press", "Triceps"],
  ["Single-Arm Cable Extension", "Triceps"],
  ["Diamond Push-Up (Tricep Focus)", "Triceps"],
  ["French Press", "Triceps"],
  ["Tricep Pressdown Machine", "Triceps"],
  ["Floor Tricep Extension", "Triceps"],
  ["Katana Extension", "Triceps"],
  ["Reverse Grip Pushdown", "Triceps"],
  ["Dip Machine", "Triceps"],
  // Quads
  ["Barbell Back Squat", "Quads"],
  ["Front Squat", "Quads"],
  ["Leg Press", "Quads"],
  ["Hack Squat Machine", "Quads"],
  ["Leg Extension", "Quads"],
  ["Goblet Squat", "Quads"],
  ["Bulgarian Split Squat", "Quads"],
  ["Walking Lunge", "Quads"],
  ["Reverse Lunge", "Quads"],
  ["Step-Up (Box/Bench)", "Quads"],
  ["Smith Machine Squat", "Quads"],
  ["Sissy Squat", "Quads"],
  ["Zercher Squat", "Quads"],
  ["Box Squat", "Quads"],
  ["Pendulum Squat", "Quads"],
  ["Pistol Squat", "Quads"],
  ["Wall Sit", "Quads"],
  ["Cyclist Squat", "Quads"],
  ["Landmine Squat", "Quads"],
  ["Belt Squat", "Quads"],
  // Hamstrings
  ["Romanian Deadlift (RDL)", "Hamstrings"],
  ["Stiff-Legged Deadlift", "Hamstrings"],
  ["Lying Leg Curl Machine", "Hamstrings"],
  ["Seated Leg Curl Machine", "Hamstrings"],
  ["Standing Leg Curl Machine", "Hamstrings"],
  ["Nordic Hamstring Curl", "Hamstrings"],
  ["Glute-Ham Raise", "Hamstrings"],
  ["Good Morning", "Hamstrings"],
  ["Single-Leg RDL", "Hamstrings"],
  ["Stability Ball Leg Curl", "Hamstrings"],
  ["Cable Pull-Through", "Hamstrings"],
  ["Sumo Deadlift", "Hamstrings"],
  ["Trap Bar Deadlift", "Hamstrings"],
  ["Kettlebell Swing", "Hamstrings"],
  ["Slider Leg Curl", "Hamstrings"],
  // Glutes
  ["Barbell Hip Thrust", "Glutes"],
  ["Dumbbell Glute Bridge", "Glutes"],
  ["Kas Glute Bridge", "Glutes"],
  ["Cable Kickback", "Glutes"],
  ["Glute Medius Kickback", "Glutes"],
  ["Abductor Machine", "Glutes"],
  ["Seated Hip Abduction (Band/Machine)", "Glutes"],
  ["Lateral Band Walk", "Glutes"],
  ["Clamshells", "Glutes"],
  ["Frog Pump", "Glutes"],
  ["Curtsy Lunge", "Glutes"],
  ["Step-Up (Glute Focus)", "Glutes"],
  ["Single-Leg Hip Thrust", "Glutes"],
  ["Deficit Reverse Lunge", "Glutes"],
  ["Cable Glute Pull-Through", "Glutes"],
  // Calves
  ["Standing Calf Raise (Machine)", "Calves"],
  ["Seated Calf Raise (Machine)", "Calves"],
  ["Calf Press on Leg Press", "Calves"],
  ["Donkey Calf Raise", "Calves"],
  ["Smith Machine Calf Raise", "Calves"],
  ["Dumbbell Single-Leg Calf Raise", "Calves"],
  ["Tibialis Raise", "Calves"],
  ["Farmer's Walk on Toes", "Calves"],
  ["Jump Rope", "Calves"],
  ["Box Jump", "Calves"],
  // Core
  ["Crunch", "Core / Abs"],
  ["Decline Crunch", "Core / Abs"],
  ["Bicycle Crunch", "Core / Abs"],
  ["Reverse Crunch", "Core / Abs"],
  ["Hanging Leg Raise", "Core / Abs"],
  ["Hanging Knee Raise", "Core / Abs"],
  ["Captain's Chair Leg Raise", "Core / Abs"],
  ["Plank", "Core / Abs"],
  ["Side Plank", "Core / Abs"],
  ["Russian Twist", "Core / Abs"],
  ["Cable Crunch (Kneeling)", "Core / Abs"],
  ["Ab Wheel Rollout", "Core / Abs"],
  ["V-Up", "Core / Abs"],
  ["Dead Bug", "Core / Abs"],
  ["Bird-Dog", "Core / Abs"],
  ["Mountain Climber", "Core / Abs"],
  ["Flutter Kicks", "Core / Abs"],
  ["Hollow Body Hold", "Core / Abs"],
  ["Woodchopper (Cable/Dumbbell)", "Core / Abs"],
  ["Pallof Press", "Core / Abs"],
  ["Leg Raise (Floor)", "Core / Abs"],
  ["Toe Touch", "Core / Abs"],
  ["Scissors", "Core / Abs"],
  ["L-Sit", "Core / Abs"],
  ["Dragon Flag", "Core / Abs"],
  // Forearms
  ["Wrist Curl (Barbell/Dumbbell)", "Forearms"],
  ["Reverse Wrist Curl", "Forearms"],
  ["Hammer Curl (Cross Body)", "Forearms"],
  ["Farmer's Walk", "Forearms"],
  ["Plate Pinch", "Forearms"],
  ["Wrist Roller", "Forearms"],
  ["Fat Grip Bicep Curl", "Forearms"],
  ["Behind-the-Back Wrist Curl", "Forearms"],
  ["Dead Hang", "Forearms"],
  ["Towel Pull-Up", "Forearms"],
  // Full Body
  ["Clean and Press", "Full Body"],
  ["Power Clean", "Full Body"],
  ["Snatch", "Full Body"],
  ["Thruster", "Full Body"],
  ["Burpee", "Full Body"],
  ["Man-Maker", "Full Body"],
  ["Medicine Ball Slam", "Full Body"],
  ["Wall Ball", "Full Body"],
  ["Kettlebell Snatch", "Full Body"],
  ["Kettlebell Clean", "Full Body"],
  ["Turkish Get-Up", "Full Body"],
  ["Battle Ropes", "Full Body"],
  ["Broad Jump", "Full Body"],
  ["Sled Push", "Full Body"],
  ["Sled Pull", "Full Body"],
  ["Renegade Row with Push-Up", "Full Body"],
  // Accessory (mapped to Other)
  ["Single-Arm Kettlebell Press", "Other"],
  ["Around the World (Dumbbell)", "Other"],
  ["Halo (Kettlebell/Plate)", "Other"],
  ["Suitcase Carry", "Other"],
  ["Waiter's Carry", "Other"],
  ["Face Pull (High Cable)", "Other"],
  ["Y-Raise (Incline Bench)", "Other"],
  ["T-Raise (Incline Bench)", "Other"],
  ["W-Raise (Incline Bench)", "Other"],
  ["Plank Jack", "Other"],
  ["Spiderman Push-Up", "Other"],
  ["Archer Push-Up", "Other"],
  ["Cossack Squat", "Other"],
];

async function seedExercisesIfEmpty(
  database: SQLite.SQLiteDatabase,
): Promise<void> {
  const row = await database.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) as n FROM exercises",
  );
  if (row && row.n > 0) return;

  for (const [name, muscle] of SEED_EXERCISES) {
    await database.runAsync(
      "INSERT INTO exercises (name, muscle_group, notes) VALUES (?, ?, '')",
      [name, muscle],
    );
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type Exercise = {
  id: number;
  name: string;
  muscle_group: string;
  notes: string;
  default_weight: number;
  default_unit: string;
  default_reps: number;
  created_at: number;
};

export type WorkoutTemplate = {
  id: number;
  name: string;
  notes: string;
  created_at: number;
};

export type TemplateExercise = {
  id: number;
  template_id: number;
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  default_sets: number;
  default_reps: number;
  default_weight: number;
  default_unit: string;
  sort_order: number;
};

export type WorkoutSession = {
  id: number;
  name: string;
  template_id: number | null;
  date: string;
  started_at: number;
  completed_at: number | null;
  notes: string;
};

export type SessionSet = {
  id: number;
  session_id: number;
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  set_number: number;
  reps: number;
  weight: number;
  completed: number;
  /** Epoch ms when the exercise was marked done; null when not done. */
  done_at: number | null;
};

export type ProgressPoint = {
  date: string;
  max_weight: number;
  total_volume: number;
  session_name: string;
};

// ─── Exercise Queries ────────────────────────────────────────────────────────

export async function getExercises(): Promise<Exercise[]> {
  const database = await getDatabase();
  return database.getAllAsync<Exercise>(
    "SELECT * FROM exercises ORDER BY name ASC",
  );
}

export async function createExercise(
  name: string,
  muscleGroup: string,
  notes: string,
  defaultWeight = 0,
  defaultUnit = "lbs",
  defaultReps = 10,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO exercises (name, muscle_group, notes, default_weight, default_unit, default_reps) VALUES (?, ?, ?, ?, ?, ?)",
    [name, muscleGroup, notes, defaultWeight, defaultUnit, defaultReps],
  );
  return result.lastInsertRowId;
}

export async function updateExercise(
  id: number,
  name: string,
  muscleGroup: string,
  notes: string,
  defaultWeight = 0,
  defaultUnit = "lbs",
  defaultReps = 10,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE exercises SET name = ?, muscle_group = ?, notes = ?, default_weight = ?, default_unit = ?, default_reps = ? WHERE id = ?",
    [name, muscleGroup, notes, defaultWeight, defaultUnit, defaultReps, id],
  );
}

export async function deleteExercise(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM exercises WHERE id = ?", [id]);
}

// ─── Template Queries ────────────────────────────────────────────────────────

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const database = await getDatabase();
  return database.getAllAsync<WorkoutTemplate>(
    "SELECT * FROM workout_templates ORDER BY sort_order ASC, name ASC",
  );
}

export async function getTemplate(id: number): Promise<WorkoutTemplate | null> {
  const database = await getDatabase();
  return database.getFirstAsync<WorkoutTemplate>(
    "SELECT * FROM workout_templates WHERE id = ?",
    [id],
  );
}

export async function getTemplateExercises(
  templateId: number,
): Promise<TemplateExercise[]> {
  const database = await getDatabase();
  return database.getAllAsync<TemplateExercise>(
    `SELECT te.*, e.name as exercise_name, e.muscle_group
     FROM template_exercises te
     JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ?
     ORDER BY te.sort_order ASC`,
    [templateId],
  );
}

export async function createTemplate(
  name: string,
  notes: string,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO workout_templates (name, notes) VALUES (?, ?)",
    [name, notes],
  );
  return result.lastInsertRowId;
}

export async function updateTemplate(
  id: number,
  name: string,
  notes: string,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE workout_templates SET name = ?, notes = ? WHERE id = ?",
    [name, notes, id],
  );
}

export async function deleteTemplate(id: number): Promise<void> {
  const database = await getDatabase();
  // Delete all sessions (and their sets via CASCADE) tied to this template
  // so progress data doesn't show stale history
  await database.runAsync(
    "DELETE FROM workout_sessions WHERE template_id = ?",
    [id],
  );
  await database.runAsync("DELETE FROM workout_templates WHERE id = ?", [id]);
}

/** Adds an exercise to a template at the top of the list (sort_order 0),
 *  shifting all existing exercises down by one. */
export async function addExerciseToTemplateAtTop(
  templateId: number,
  exerciseId: number,
  defaultSets: number,
  defaultReps: number,
  defaultWeight = 0,
  defaultUnit = "lbs",
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "UPDATE template_exercises SET sort_order = sort_order + 1 WHERE template_id = ?",
      [templateId],
    );
    await database.runAsync(
      `INSERT INTO template_exercises
         (template_id, exercise_id, default_sets, default_reps, sort_order, default_weight, default_unit)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [templateId, exerciseId, defaultSets, defaultReps, defaultWeight, defaultUnit],
    );
  });
}

export async function updateTemplateExercise(
  id: number,
  defaultSets: number,
  defaultReps: number,
  defaultWeight = 0,
  defaultUnit = "lbs",
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE template_exercises SET default_sets = ?, default_reps = ?, default_weight = ?, default_unit = ? WHERE id = ?",
    [defaultSets, defaultReps, defaultWeight, defaultUnit, id],
  );
}

export async function removeExerciseFromTemplate(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM template_exercises WHERE id = ?", [id]);
}

// ─── Session Queries ─────────────────────────────────────────────────────────

export async function getSession(id: number): Promise<WorkoutSession | null> {
  const database = await getDatabase();
  return database.getFirstAsync<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE id = ?",
    [id],
  );
}

export async function getInProgressSession(): Promise<WorkoutSession | null> {
  const database = await getDatabase();
  return database.getFirstAsync<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NULL ORDER BY started_at DESC LIMIT 1",
  );
}

export async function getSessionSets(sessionId: number): Promise<SessionSet[]> {
  const database = await getDatabase();
  return database.getAllAsync<SessionSet>(
    `SELECT ss.*, e.name as exercise_name, e.muscle_group
     FROM session_sets ss
     JOIN exercises e ON e.id = ss.exercise_id
     WHERE ss.session_id = ?
     ORDER BY ss.id ASC`,
    [sessionId],
  );
}

export async function createSession(
  name: string,
  templateId: number | null,
  date: string,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO workout_sessions (name, template_id, date) VALUES (?, ?, ?)",
    [name, templateId, date],
  );
  return result.lastInsertRowId;
}

/** Workouts are auto-ended at this length, and a session's recorded
 *  duration never exceeds it. */
export const MAX_WORKOUT_SECONDS = 2 * 60 * 60;

export async function completeSession(id: number): Promise<void> {
  const database = await getDatabase();
  // Cap the end time at the max duration so a workout left running in the
  // background doesn't record an inflated duration. The completed_at guard
  // makes this a no-op when another path already ended the session.
  const result = await database.runAsync(
    `UPDATE workout_sessions
     SET completed_at = MIN(CAST(strftime('%s', 'now') AS INTEGER), started_at + ?)
     WHERE id = ? AND completed_at IS NULL`,
    [MAX_WORKOUT_SECONDS, id],
  );
  if (result.changes === 0) return;
  await syncTemplateWeightsFromSession(id);
  await syncTemplateOrderFromSession(id);
}

/** Pushes each exercise's first-set weight from a finished session back into
 *  the originating template, so the template tracks your current working
 *  weight instead of staying pinned to whatever it was when created. */
async function syncTemplateWeightsFromSession(sessionId: number): Promise<void> {
  const database = await getDatabase();
  const session = await database.getFirstAsync<{ template_id: number | null }>(
    "SELECT template_id FROM workout_sessions WHERE id = ?",
    [sessionId],
  );
  if (!session?.template_id) return;
  const templateId = session.template_id;

  const exercises = await database.getAllAsync<{ exercise_id: number }>(
    "SELECT DISTINCT exercise_id FROM session_sets WHERE session_id = ?",
    [sessionId],
  );

  await database.withTransactionAsync(async () => {
    for (const { exercise_id: exerciseId } of exercises) {
      const firstSet = await database.getFirstAsync<{ weight: number }>(
        `SELECT weight FROM session_sets
         WHERE session_id = ? AND exercise_id = ?
         ORDER BY set_number ASC, id ASC
         LIMIT 1`,
        [sessionId, exerciseId],
      );
      if (!firstSet) continue;
      await database.runAsync(
        "UPDATE template_exercises SET default_weight = ? WHERE template_id = ? AND exercise_id = ?",
        [firstSet.weight, templateId, exerciseId],
      );
    }
  });
}

/** Reorders the originating template to match the order exercises were
 *  marked done in a finished session, so the next run follows how you
 *  actually did it. Template exercises that weren't marked done keep their
 *  relative order after the done ones; exercises not on the template are
 *  ignored. No-op if nothing was marked done. */
async function syncTemplateOrderFromSession(sessionId: number): Promise<void> {
  const database = await getDatabase();
  const session = await database.getFirstAsync<{ template_id: number | null }>(
    "SELECT template_id FROM workout_sessions WHERE id = ?",
    [sessionId],
  );
  if (!session?.template_id) return;
  const templateId = session.template_id;

  const doneRows = await database.getAllAsync<{ exercise_id: number }>(
    `SELECT exercise_id FROM session_sets
     WHERE session_id = ? AND completed = 1 AND done_at IS NOT NULL
     GROUP BY exercise_id
     ORDER BY MIN(done_at) ASC`,
    [sessionId],
  );
  if (doneRows.length === 0) return;

  const existing = await database.getAllAsync<{
    id: number;
    exercise_id: number;
  }>(
    "SELECT id, exercise_id FROM template_exercises WHERE template_id = ? ORDER BY sort_order ASC",
    [templateId],
  );
  if (existing.length === 0) return;

  const rowIdByExerciseId = new Map(
    existing.map((e) => [e.exercise_id, e.id]),
  );
  const doneOrder = doneRows
    .map((r) => r.exercise_id)
    .filter((eid) => rowIdByExerciseId.has(eid));
  const notDone = existing
    .map((e) => e.exercise_id)
    .filter((eid) => !doneOrder.includes(eid));
  const finalOrder = [...doneOrder, ...notDone];

  await database.withTransactionAsync(async () => {
    for (let i = 0; i < finalOrder.length; i++) {
      const rowId = rowIdByExerciseId.get(finalOrder[i]);
      if (rowId === undefined) continue;
      await database.runAsync(
        "UPDATE template_exercises SET sort_order = ? WHERE id = ?",
        [i, rowId],
      );
    }
  });
}

export async function deleteSession(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM workout_sessions WHERE id = ?", [id]);
}

export async function addSet(
  sessionId: number,
  exerciseId: number,
  setNumber: number,
  reps: number,
  weight: number,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO session_sets (session_id, exercise_id, set_number, reps, weight) VALUES (?, ?, ?, ?, ?)",
    [sessionId, exerciseId, setNumber, reps, weight],
  );
  return result.lastInsertRowId;
}

export async function updateSet(
  id: number,
  reps: number,
  weight: number,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE session_sets SET reps = ?, weight = ? WHERE id = ?",
    [reps, weight, id],
  );
}

export async function deleteSet(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM session_sets WHERE id = ?", [id]);
}

/** Marks all sets for an exercise within a session as done/not-done. Used to
 *  persist the "Done" toggle so it survives app restarts, and to record when
 *  it was marked done (drives the template order on finish). */
export async function setExerciseSetsCompleted(
  sessionId: number,
  exerciseId: number,
  completed: boolean,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE session_sets SET completed = ?, done_at = ? WHERE session_id = ? AND exercise_id = ?",
    [completed ? 1 : 0, completed ? Date.now() : null, sessionId, exerciseId],
  );
}

// ─── Progress Queries ────────────────────────────────────────────────────────

export async function getExerciseProgress(
  exerciseId: number,
): Promise<ProgressPoint[]> {
  const database = await getDatabase();
  return database.getAllAsync<ProgressPoint>(
    `SELECT
       ws.date,
       ws.name as session_name,
       COALESCE(MAX(CASE WHEN ss.reps > 0 THEN ss.weight END), 0) as max_weight,
       SUM(ss.reps * ss.weight) as total_volume
     FROM session_sets ss
     JOIN workout_sessions ws ON ws.id = ss.session_id
     WHERE ss.exercise_id = ? AND ws.completed_at IS NOT NULL
     GROUP BY ws.id
     ORDER BY ws.date ASC, ws.started_at ASC`,
    [exerciseId],
  );
}

export async function getRecentSessions(limit = 10): Promise<WorkoutSession[]> {
  const database = await getDatabase();
  return database.getAllAsync<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NOT NULL ORDER BY date DESC, started_at DESC LIMIT ?",
    [limit],
  );
}

/** Total volume per session for a specific muscle group */
export async function getMuscleGroupProgress(
  muscleGroup: string,
): Promise<ProgressPoint[]> {
  const database = await getDatabase();
  return database.getAllAsync<ProgressPoint>(
    `SELECT
       ws.date,
       ws.name as session_name,
       COALESCE(MAX(CASE WHEN ss.reps > 0 THEN ss.weight END), 0) as max_weight,
       SUM(ss.reps * ss.weight) as total_volume
     FROM session_sets ss
     JOIN workout_sessions ws ON ws.id = ss.session_id
     JOIN exercises e ON e.id = ss.exercise_id
     WHERE e.muscle_group = ? AND ws.completed_at IS NOT NULL
     GROUP BY ws.id
     ORDER BY ws.date ASC, ws.started_at ASC`,
    [muscleGroup],
  );
}

/** Total volume per session across all exercises */
export async function getAllVolumeProgress(): Promise<ProgressPoint[]> {
  const database = await getDatabase();
  return database.getAllAsync<ProgressPoint>(
    `SELECT
       ws.date,
       ws.name as session_name,
       COALESCE(MAX(CASE WHEN ss.reps > 0 THEN ss.weight END), 0) as max_weight,
       SUM(ss.reps * ss.weight) as total_volume
     FROM session_sets ss
     JOIN workout_sessions ws ON ws.id = ss.session_id
     WHERE ws.completed_at IS NOT NULL
     GROUP BY ws.id
     ORDER BY ws.date ASC, ws.started_at ASC`,
  );
}

export type CalendarDay = { date: string; count: number };

/** Workout counts per day for the last `days` days (for the activity heatmap) */
export async function getWorkoutCalendarDates(
  days = 365,
): Promise<CalendarDay[]> {
  const database = await getDatabase();
  return database.getAllAsync<CalendarDay>(
    `SELECT date, COUNT(*) as count
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND date >= date('now', 'localtime', ? || ' days')
     GROUP BY date
     ORDER BY date ASC`,
    [`-${days}`],
  );
}

export type SessionDuration = {
  date: string;
  session_name: string;
  duration_minutes: number;
};

/** Duration in minutes for every completed session, ordered oldest→newest */
export async function getSessionDurations(): Promise<SessionDuration[]> {
  const database = await getDatabase();
  return database.getAllAsync<SessionDuration>(
    `SELECT
       date,
       name as session_name,
       ROUND((completed_at - started_at) / 60.0, 1) as duration_minutes
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND started_at IS NOT NULL
       AND (completed_at - started_at) > 0
     ORDER BY date ASC, started_at ASC`,
  );
}

export type MuscleGroupVolume = { muscle_group: string; total_volume: number };

/** All-time total volume per muscle group (for body heatmap on Overall tab) */
export async function getAllTimeMuscleGroupVolumes(): Promise<
  MuscleGroupVolume[]
> {
  const database = await getDatabase();
  return database.getAllAsync<MuscleGroupVolume>(
    `SELECT e.muscle_group, SUM(ss.reps * ss.weight) as total_volume
     FROM session_sets ss
     JOIN exercises e ON e.id = ss.exercise_id
     JOIN workout_sessions ws ON ws.id = ss.session_id
     WHERE ws.completed_at IS NOT NULL
     GROUP BY e.muscle_group`,
  );
}

/** Per-muscle-group total volume for a single session (for body heatmap on session detail) */
export async function getSessionMuscleGroupVolumes(
  sessionId: number,
): Promise<MuscleGroupVolume[]> {
  const database = await getDatabase();
  return database.getAllAsync<MuscleGroupVolume>(
    `SELECT e.muscle_group, SUM(ss.reps * ss.weight) as total_volume
     FROM session_sets ss
     JOIN exercises e ON e.id = ss.exercise_id
     WHERE ss.session_id = ?
     GROUP BY e.muscle_group`,
    [sessionId],
  );
}

/** Persist a new sort order for template exercises (orderedIds[0] = first in list) */
export async function reorderTemplateExercises(
  orderedIds: number[],
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await database.runAsync(
        "UPDATE template_exercises SET sort_order = ? WHERE id = ?",
        [i, orderedIds[i]],
      );
    }
  });
}

/** Returns only exercises that have at least one completed session set */
export async function getExercisesWithData(): Promise<Exercise[]> {
  const database = await getDatabase();
  return database.getAllAsync<Exercise>(
    `SELECT DISTINCT e.* FROM exercises e
     JOIN session_sets ss ON ss.exercise_id = e.id
     JOIN workout_sessions ws ON ws.id = ss.session_id
     WHERE ws.completed_at IS NOT NULL
     ORDER BY e.name ASC`,
  );
}

/** Creates a workout template that mirrors a completed session's exercises/sets */
export async function createTemplateFromSession(
  sessionId: number,
): Promise<number> {
  const database = await getDatabase();
  // Create an empty template (user will fill in the name on the edit screen)
  const result = await database.runAsync(
    "INSERT INTO workout_templates (name, notes) VALUES (?, ?)",
    ["", ""],
  );
  const templateId = result.lastInsertRowId;

  // Distinct exercises in the session, in order of first appearance
  const sessionExercises = await database.getAllAsync<{ exercise_id: number }>(
    `SELECT exercise_id FROM session_sets
     WHERE session_id = ?
     GROUP BY exercise_id
     ORDER BY MIN(id) ASC`,
    [sessionId],
  );
  const sessionExerciseIds = sessionExercises.map((e) => e.exercise_id);

  // Prefer the order of the template this session was started from, so
  // reordering that happened mid-workout doesn't scramble the saved template.
  const session = await database.getFirstAsync<{
    template_id: number | null;
  }>("SELECT template_id FROM workout_sessions WHERE id = ?", [sessionId]);

  let orderedExerciseIds = sessionExerciseIds;
  if (session?.template_id) {
    const originalOrder = await database.getAllAsync<{ exercise_id: number }>(
      "SELECT exercise_id FROM template_exercises WHERE template_id = ? ORDER BY sort_order ASC",
      [session.template_id],
    );
    const fromTemplate = originalOrder
      .map((r) => r.exercise_id)
      .filter((eid) => sessionExerciseIds.includes(eid));
    // Exercises added mid-workout that weren't in the original template are
    // appended in the order they were first logged.
    const extras = sessionExerciseIds.filter(
      (eid) => !fromTemplate.includes(eid),
    );
    orderedExerciseIds = [...fromTemplate, ...extras];
  }

  for (let i = 0; i < orderedExerciseIds.length; i++) {
    const eid = orderedExerciseIds[i];
    const sets = await database.getAllAsync<{ reps: number; weight: number }>(
      `SELECT reps, weight FROM session_sets
       WHERE session_id = ? AND exercise_id = ?
       ORDER BY set_number ASC`,
      [sessionId, eid],
    );

    const setCount = sets.length;
    // Use the first set's weight/reps so the template reflects the working
    // weight you start an exercise with, not whatever the last set landed on.
    const firstSet = sets[0];
    const defaultReps = firstSet?.reps ?? 10;
    const defaultWeight = firstSet?.weight ?? 0;

    await database.runAsync(
      `INSERT INTO template_exercises
         (template_id, exercise_id, default_sets, default_reps, default_weight, default_unit, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [templateId, eid, setCount, defaultReps, defaultWeight, "lbs", i],
    );
  }

  return templateId;
}

/** Persist a new sort order for templates (orderedIds[0] = first in list) */
export async function reorderTemplates(orderedIds: number[]): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await database.runAsync(
        "UPDATE workout_templates SET sort_order = ? WHERE id = ?",
        [i, orderedIds[i]],
      );
    }
  });
}

// ─── Import / Export ─────────────────────────────────────────────────────────

export type ExportPayload = {
  version: number;
  exported_at: string;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  template_exercises: TemplateExercise[];
  sessions: WorkoutSession[];
  session_sets: SessionSet[];
};

export async function exportAllData(): Promise<ExportPayload> {
  const database = await getDatabase();
  const [exercises, templates, template_exercises, sessions] =
    await Promise.all([
      database.getAllAsync<Exercise>("SELECT * FROM exercises"),
      database.getAllAsync<WorkoutTemplate>("SELECT * FROM workout_templates"),
      database.getAllAsync<TemplateExercise>(
        `SELECT te.*, e.name as exercise_name, e.muscle_group FROM template_exercises te
       JOIN exercises e ON e.id = te.exercise_id`,
      ),
      database.getAllAsync<WorkoutSession>("SELECT * FROM workout_sessions"),
    ]);
  const session_sets = await database.getAllAsync<SessionSet>(
    `SELECT ss.*, e.name as exercise_name, e.muscle_group FROM session_sets ss
     JOIN exercises e ON e.id = ss.exercise_id`,
  );
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    exercises,
    templates,
    template_exercises,
    sessions,
    session_sets,
  };
}

export async function importAllData(payload: ExportPayload): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    // Step 1: Build a mapping from payload exercise IDs → DB exercise IDs.
    // Exercises that exactly match an existing entry (name + muscle_group) are
    // reused so seeded exercises are never deleted or duplicated.
    const exerciseIdMap = new Map<number, number>();
    for (const e of payload.exercises) {
      const existing = await database.getFirstAsync<{ id: number }>(
        "SELECT id FROM exercises WHERE name = ? AND muscle_group = ?",
        [e.name, e.muscle_group],
      );
      if (existing) {
        exerciseIdMap.set(e.id, existing.id);
      } else {
        const result = await database.runAsync(
          `INSERT INTO exercises
             (name, muscle_group, notes, default_weight, default_unit, default_reps, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            e.name,
            e.muscle_group,
            e.notes,
            e.default_weight ?? 0,
            e.default_unit ?? "lbs",
            e.default_reps ?? 10,
            e.created_at,
          ],
        );
        exerciseIdMap.set(e.id, result.lastInsertRowId);
      }
    }

    // Step 2: Clear only user-generated data — exercises are intentionally kept.
    await database.execAsync(`
      DELETE FROM session_sets;
      DELETE FROM workout_sessions;
      DELETE FROM template_exercises;
      DELETE FROM workout_templates;
    `);

    // Step 3: Restore templates.
    for (const t of payload.templates) {
      await database.runAsync(
        `INSERT OR REPLACE INTO workout_templates (id, name, notes, created_at) VALUES (?, ?, ?, ?)`,
        [t.id, t.name, t.notes, t.created_at],
      );
    }

    // Step 4: Restore template_exercises, remapping exercise IDs.
    for (const te of payload.template_exercises) {
      const mappedExerciseId = exerciseIdMap.get(te.exercise_id) ?? te.exercise_id;
      await database.runAsync(
        `INSERT OR REPLACE INTO template_exercises
           (id, template_id, exercise_id, default_sets, default_reps, default_weight, default_unit, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          te.id,
          te.template_id,
          mappedExerciseId,
          te.default_sets,
          te.default_reps,
          te.default_weight ?? 0,
          te.default_unit ?? "lbs",
          te.sort_order,
        ],
      );
    }

    // Step 5: Restore sessions. The date is re-derived from the start time in
    // local time, since older exports stored UTC dates.
    for (const s of payload.sessions) {
      await database.runAsync(
        `INSERT OR REPLACE INTO workout_sessions
           (id, name, template_id, date, started_at, completed_at, notes)
         VALUES (?, ?, ?, date(?, 'unixepoch', 'localtime'), ?, ?, ?)`,
        [
          s.id,
          s.name,
          s.template_id,
          s.started_at,
          s.started_at,
          s.completed_at,
          s.notes,
        ],
      );
    }

    // Step 6: Restore session sets, remapping exercise IDs.
    for (const ss of payload.session_sets) {
      const mappedExerciseId = exerciseIdMap.get(ss.exercise_id) ?? ss.exercise_id;
      await database.runAsync(
        `INSERT OR REPLACE INTO session_sets
           (id, session_id, exercise_id, set_number, reps, weight, completed, done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ss.id,
          ss.session_id,
          mappedExerciseId,
          ss.set_number,
          ss.reps,
          ss.weight,
          ss.completed,
          ss.done_at ?? null,
        ],
      );
    }
  });
}
