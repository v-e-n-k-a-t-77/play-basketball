import type { PoolClient } from "pg";

const DAY_MS = 24 * 60 * 60 * 1000;
const GAME_MINUTES = 90;

// max = the whole roster, substitutes included (2 teams x roster size)
const FORMATS = [
  { format: "HALF_COURT_3V3", max: 8 }, // 2 teams x (3 players + 1 sub), like FIBA 3x3
  { format: "FULL_COURT_5V5", max: 24 }, // 2 teams x 12-player roster, like FIBA
  { format: "OPEN_RUN", max: 30 }, // no fixed teams, winners stay on; 30 is our database limit
];

const TITLES = [
  "Evening run",
  "Sunset hoops",
  "Weekend pickup",
  "After-work game",
  "Casual shootaround",
];

const PRIVATE_CODES = ["DUNKS234", "DUNKS345", "DUNKS456", "DUNKS567"];

type Player = { id: string; skill: number };

type GameInput = {
  hostId: string;
  courtId: string;
  title: string;
  format: string;
  max: number;
  startsAt: Date;
  skillMin: number;
  joinMode: "INSTANT" | "APPROVAL";
  inviteCode: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  cancelReason: string | null;
  joined: Player[];
  waitlisted: Player[];
  pending: Player[];
  noShowId: string | null;
};

// 12:30, 13:30 or 14:30 UTC = 6:00, 7:00 or 8:00 PM in India
function evening(dayOffset: number, slot: number): Date {
  const date = new Date(Date.now() + dayOffset * DAY_MS);
  date.setUTCHours(12 + slot, 30, 0, 0);
  return date;
}

async function insertGame(tx: PoolClient, g: GameInput): Promise<void> {
  const endsAt = new Date(g.startsAt.getTime() + GAME_MINUTES * 60 * 1000);

  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO games
       (host_id, court_id, title, format, starts_at, ends_at, max_players, joined_count,
        waitlist_count, skill_min, visibility, invite_code, join_mode, status,
        cancel_reason, cancelled_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    [
      g.hostId,
      g.courtId,
      g.title,
      g.format,
      g.startsAt,
      endsAt,
      g.max,
      1 + g.joined.length,
      g.waitlisted.length,
      g.skillMin,
      g.inviteCode ? "PRIVATE" : "PUBLIC",
      g.inviteCode,
      g.joinMode,
      g.status,
      g.cancelReason,
      g.status === "CANCELLED" ? new Date() : null,
      g.status === "COMPLETED" ? endsAt : null,
    ],
  );
  const gameId = rows[0].id;

  const attendanceOf = (userId: string): string => {
    if (g.status !== "COMPLETED") return "UNMARKED";
    return userId === g.noShowId ? "NO_SHOW" : "ATTENDED";
  };

  const addParticipant = (
    userId: string,
    status: string,
    position: number | null,
    isHost = false,
  ) =>
    tx.query(
      `INSERT INTO game_participants
         (game_id, user_id, status, attendance, waitlist_position, is_host, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        gameId,
        userId,
        status,
        attendanceOf(userId),
        position,
        isHost,
        status === "JOINED" ? new Date() : null,
      ],
    );

  await addParticipant(g.hostId, "JOINED", null, true);
  for (const p of g.joined) {
    await addParticipant(p.id, "JOINED", null);
  }
  for (const [i, p] of g.waitlisted.entries()) {
    await addParticipant(p.id, "WAITLISTED", i + 1);
  }
  for (const p of g.pending) {
    await addParticipant(p.id, "PENDING", null);
  }

  await tx.query(
    `INSERT INTO game_events (game_id, actor_id, type, payload)
     VALUES ($1, $2, 'GAME_CREATED', $3)`,
    [gameId, g.hostId, JSON.stringify({ seeded: true })],
  );
}

export async function seedGames(tx: PoolClient): Promise<void> {
  const { rows: playerRows } = await tx.query<{ id: string; skill_level: number }>(
    `SELECT u.id, p.skill_level
     FROM users u JOIN player_profiles p ON p.user_id = u.id
     WHERE u.email LIKE 'player%@example.com'
     ORDER BY u.email`,
  );
  const players: Player[] = playerRows.map((r) => ({ id: r.id, skill: r.skill_level }));

  const { rows: courtRows } = await tx.query<{ id: string }>(
    "SELECT id FROM courts WHERE status = 'APPROVED' ORDER BY name",
  );
  const courtIds = courtRows.map((r) => r.id);

  // 40 upcoming games over the next 14 days
  let privateIndex = 0;
  for (let i = 0; i < 40; i++) {
    const host = players[i % 30];
    const { format, max } = FORMATS[i % 3];
    const skillMin = i % 7 === 3 ? 3 : 1;
    const joinMode = i % 6 === 5 ? "APPROVAL" : "INSTANT";

    const eligible = players.filter((p) => p.id !== host.id && p.skill >= skillMin);
    const shift = i % eligible.length;
    const rotated = [...eligible.slice(shift), ...eligible.slice(0, shift)];

    // how full the roster is: full, nearly full, half, host only, full
    const fill = [max, max - 1, Math.ceil(max / 2), 1, max][i % 5];
    const joined = rotated.slice(0, Math.min(fill, 1 + rotated.length) - 1);

    // a waitlist only exists when the game is really full AND players are left over
    const isFull = joined.length === max - 1;
    const waitlisted = isFull && i % 5 === 0 ? rotated.slice(joined.length, joined.length + 3) : [];

    const pendingStart = joined.length + waitlisted.length;
    const pending = joinMode === "APPROVAL" ? rotated.slice(pendingStart, pendingStart + 2) : [];

    await insertGame(tx, {
      hostId: host.id,
      courtId: courtIds[i % courtIds.length],
      title: TITLES[i % TITLES.length],
      format,
      max,
      startsAt: evening(1 + (i % 14), i % 3),
      skillMin,
      joinMode,
      inviteCode: i % 9 === 8 ? PRIVATE_CODES[privateIndex++] : null,
      status: "SCHEDULED",
      cancelReason: null,
      joined,
      waitlisted,
      pending,
      noShowId: null,
    });
  }

  // 5 completed games in the past, with attendance marked
  for (let k = 0; k < 5; k++) {
    const host = players[20 + k];
    // host + 11 players = 12 signed up: 10 on court plus 2 substitutes
    const joined = players.filter((p) => p.id !== host.id).slice(0, 11);

    await insertGame(tx, {
      hostId: host.id,
      courtId: courtIds[k],
      title: `${TITLES[k]} (past)`,
      format: "FULL_COURT_5V5",
      max: 24,
      startsAt: evening(-(k + 1), k % 3),
      skillMin: 1,
      joinMode: "INSTANT",
      inviteCode: null,
      status: "COMPLETED",
      cancelReason: null,
      joined,
      waitlisted: [],
      pending: [],
      noShowId: k % 2 === 0 ? joined[joined.length - 1].id : null,
    });
  }

  // 2 cancelled games
  const reasons = ["Heavy rain forecast", "Court is not available"];
  for (let k = 0; k < 2; k++) {
    const host = players[27 + k];
    await insertGame(tx, {
      hostId: host.id,
      courtId: courtIds[k + 5],
      title: `${TITLES[k + 1]} (cancelled)`,
      format: "OPEN_RUN",
      max: 30,
      startsAt: evening(3 + k, 2),
      skillMin: 1,
      joinMode: "INSTANT",
      inviteCode: null,
      status: "CANCELLED",
      cancelReason: reasons[k],
      joined: players.filter((p) => p.id !== host.id).slice(0, 3),
      waitlisted: [],
      pending: [],
      noShowId: null,
    });
  }

  // Fill the profile counters from the games we just created
  await tx.query(
    `UPDATE player_profiles p
     SET games_completed = s.completed, games_attended = s.attended, no_shows = s.no_shows
     FROM (
       SELECT gp.user_id,
              count(*) AS completed,
              count(*) FILTER (WHERE gp.attendance = 'ATTENDED') AS attended,
              count(*) FILTER (WHERE gp.attendance = 'NO_SHOW') AS no_shows
       FROM game_participants gp JOIN games g ON g.id = gp.game_id
       WHERE g.status = 'COMPLETED' AND gp.status = 'JOINED'
       GROUP BY gp.user_id
     ) s
     WHERE p.user_id = s.user_id`,
  );
  await tx.query(
    `UPDATE player_profiles p SET games_hosted = h.n
     FROM (SELECT host_id, count(*) AS n FROM games WHERE status <> 'CANCELLED' GROUP BY host_id) h
     WHERE p.user_id = h.host_id`,
  );
}
