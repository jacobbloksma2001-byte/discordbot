const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function getActivitySettings(config) {
  return config.ACTIVITY_SETTINGS || {};
}

function getWeekKey(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((utc - firstThursday) / 604800000);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function parseDbDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+02:00`;
  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDuration(totalSeconds = 0) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}u ${String(minutes).padStart(2, '0')}m`;
}

function formatDateTimeNL(value) {
  const date = parseDbDate(value);
  if (!date) return 'Onbekend';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

async function formatDbDateTimeNL(pool, value) {
  const date = parseDbDate(value);
  if (!date) return 'Onbekend';
  const iso = date.toISOString().slice(0, 19).replace('T', ' ');
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(?, '%d-%m-%Y %H:%i') AS formatted`,
    [iso]
  );
  return rows[0]?.formatted || 'Onbekend';
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function buildPanelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('activity_clock_in').setLabel('Inklokken').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('activity_clock_out').setLabel('Uitklokken').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('activity_my_stats').setLabel('Mijn activiteit').setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildCheckButtons(sessionId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`activity_confirm_check:${sessionId}`).setLabel('Ik ben nog actief').setStyle(ButtonStyle.Success)
    )
  ];
}

async function ensureAllowed(member, config) {
  const settings = getActivitySettings(config);
  if (!settings.MINIMUM_ROLE_ID) return { ok: true };
  if (member.roles.cache.has(settings.MINIMUM_ROLE_ID)) return { ok: true };
  return { ok: false, message: 'Je hebt niet de juiste rang om te inklokken.' };
}

async function isStaff(member, config) {
  const settings = getActivitySettings(config);
  return [settings.KADER_ROLE_ID, settings.SEMI_KADER_ROLE_ID, settings.STAFF_ROLE_ID].filter(Boolean).some(id => member.roles.cache.has(id));
}

async function ensureActivityTables(pool) {
  await pool.execute(`CREATE TABLE IF NOT EXISTS activity_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    username VARCHAR(100) NULL,
    display_name VARCHAR(100) NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    status ENUM('active','completed','forced','auto_timeout') NOT NULL DEFAULT 'active',
    check_sent_at DATETIME NULL,
    check_deadline_at DATETIME NULL,
    last_check_confirmed_at DATETIME NULL,
    missed_checks INT NOT NULL DEFAULT 0,
    started_by VARCHAR(32) NULL,
    ended_by VARCHAR(32) NULL,
    end_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (guild_id, user_id, status),
    INDEX idx_started (guild_id, started_at)
  )`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS activity_weekly_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    week_key VARCHAR(16) NOT NULL,
    username VARCHAR(100) NULL,
    display_name VARCHAR(100) NULL,
    total_seconds INT NOT NULL DEFAULT 0,
    sessions_count INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_week_user (guild_id, user_id, week_key)
  )`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS activity_panels (
    guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
    panel_channel_id VARCHAR(32) NULL,
    panel_message_id VARCHAR(32) NULL,
    staff_channel_id VARCHAR(32) NULL,
    staff_live_message_id VARCHAR(32) NULL,
    staff_rank_message_id VARCHAR(32) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  const alterStatements = [
    "ALTER TABLE activity_sessions ADD COLUMN started_at_unix BIGINT NULL AFTER started_at",
    "ALTER TABLE activity_sessions ADD COLUMN ended_at_unix BIGINT NULL AFTER ended_at",
    "ALTER TABLE activity_sessions ADD COLUMN check_sent_at_unix BIGINT NULL AFTER check_sent_at",
    "ALTER TABLE activity_sessions ADD COLUMN check_deadline_at_unix BIGINT NULL AFTER check_deadline_at",
    "ALTER TABLE activity_sessions ADD COLUMN last_check_confirmed_at_unix BIGINT NULL AFTER last_check_confirmed_at"
  ];

  for (const sql of alterStatements) {
    try {
      await pool.execute(sql);
    } catch (error) {
      if (!String(error.message || error).toLowerCase().includes('duplicate column')) throw error;
    }
  }
}

async function getActiveSession(pool, guildId, userId) {
  const [rows] = await pool.execute(`SELECT * FROM activity_sessions WHERE guild_id = ? AND user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`, [guildId, userId]);
  return rows[0] || null;
}

async function clockInMember({ pool, guild, member, actorId }) {
  const existing = await getActiveSession(pool, guild.id, member.id);
  if (existing) return { ok: false, reason: 'Je bent al ingeklokt.' };
  const now = new Date();
  const unix = Math.floor(now.getTime() / 1000);
  const stamp = now.toISOString().slice(0, 19).replace('T', ' ');
  await pool.execute(`INSERT INTO activity_sessions (guild_id, user_id, username, display_name, started_at, started_at_unix, status, started_by, last_check_confirmed_at, last_check_confirmed_at_unix, check_sent_at, check_deadline_at, check_sent_at_unix, check_deadline_at_unix, missed_checks) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL, NULL, NULL, 0)`, [guild.id, member.id, member.user.username, member.displayName, stamp, unix, actorId || member.id, stamp, unix]);
  return { ok: true };
}

async function closeSession({ pool, guildId, userId, actorId, status, endReason }) {
  const session = await getActiveSession(pool, guildId, userId);
  if (!session) return { ok: false, reason: 'Er is geen actieve sessie gevonden.' };
  const now = new Date();
  const endUnix = Math.floor(now.getTime() / 1000);
  const endStamp = now.toISOString().slice(0, 19).replace('T', ' ');
  const startUnix = Number(session.started_at_unix || 0);
  const durationSeconds = Math.max(0, startUnix > 0 ? endUnix - startUnix : Math.floor((now.getTime() - (parseDbDate(session.started_at) || now).getTime()) / 1000));
  const weekKey = getWeekKey(now);

  await pool.execute(`UPDATE activity_sessions SET ended_at = ?, ended_at_unix = ?, duration_seconds = ?, status = ?, ended_by = ?, end_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [endStamp, endUnix, durationSeconds, status, actorId || userId, endReason || null, session.id]);
  await pool.execute(`INSERT INTO activity_weekly_stats (guild_id, user_id, week_key, username, display_name, total_seconds, sessions_count) VALUES (?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE username = VALUES(username), display_name = VALUES(display_name), total_seconds = total_seconds + VALUES(total_seconds), sessions_count = sessions_count + 1, updated_at = CURRENT_TIMESTAMP`, [guildId, userId, weekKey, session.username, session.display_name, durationSeconds]);

  return { ok: true, session: { ...session, duration_seconds: durationSeconds, ended_at: endStamp, ended_at_unix: endUnix } };
}

async function getTodaySeconds(pool, guildId, userId) {
  const [rows] = await pool.execute(`SELECT COALESCE(SUM(duration_seconds), 0) AS total FROM activity_sessions WHERE guild_id = ? AND user_id = ? AND ended_at IS NOT NULL AND DATE(ended_at) = CURDATE()`, [guildId, userId]);
  return Number(rows[0]?.total || 0);
}

async function getWeekSeconds(pool, guildId, userId) {
  const [rows] = await pool.execute(`SELECT total_seconds, sessions_count FROM activity_weekly_stats WHERE guild_id = ? AND user_id = ? AND week_key = ? LIMIT 1`, [guildId, userId, getWeekKey(new Date())]);
  return rows[0] || { total_seconds: 0, sessions_count: 0 };
}

async function getWeeklyRanking(pool, guildId, limit = 10) {
  const [rows] = await pool.execute(`SELECT user_id, username, display_name, total_seconds, sessions_count FROM activity_weekly_stats WHERE guild_id = ? AND week_key = ? ORDER BY total_seconds DESC, sessions_count DESC, display_name ASC LIMIT ?`, [guildId, getWeekKey(new Date()), Number(limit)]);
  return rows;
}

async function getUserRankingPosition(pool, guildId, userId) {
  const ranking = await getWeeklyRanking(pool, guildId, 500);
  const index = ranking.findIndex(row => String(row.user_id) === String(userId));
  return { position: index >= 0 ? index + 1 : null, total: ranking.length, row: index >= 0 ? ranking[index] : null };
}

async function getActiveSessions(pool, guildId) {
  const [rows] = await pool.execute(`SELECT * FROM activity_sessions WHERE guild_id = ? AND status = 'active' ORDER BY started_at ASC`, [guildId]);
  return rows;
}

async function getMemberActivitySummary(pool, guildId, userId) {
  const active = await getActiveSession(pool, guildId, userId);
  const todaySeconds = await getTodaySeconds(pool, guildId, userId);
  const week = await getWeekSeconds(pool, guildId, userId);
  const position = await getUserRankingPosition(pool, guildId, userId);

  let liveSeconds = 0;
  if (active?.id) {
    const nowUnix = Math.floor(Date.now() / 1000);
    liveSeconds = Math.max(0, nowUnix - Number(active.started_at_unix || nowUnix));
  }

  const activeSince = active?.started_at ? await formatDbDateTimeNL(pool, active.started_at) : 'Niet actief';

  return {
    active,
    todaySeconds,
    weekSeconds: Number(week.total_seconds || 0),
    sessionsCount: Number(week.sessions_count || 0),
    position,
    liveSeconds,
    activeSince,
  };
}

function createCleanEmbed({ createBaseEmbed, title, description, fields = [] }) {
  return createBaseEmbed({ title, description, fields, image: true });
}

function createActivityEmbed(createBaseEmbed, member, summary) {
  const totalToday = summary.todaySeconds + summary.liveSeconds;
  const totalWeek = summary.weekSeconds + summary.liveSeconds;

  return createCleanEmbed({
    createBaseEmbed,
    title: '✦ Jouw activiteit ✦',
    description: `${member} hieronder staat jouw actuele overzicht.`,
    fields: [
      { name: 'Status', value: summary.active ? '🟢 Ingeklokt' : '🔴 Uitgeklokt', inline: true },
      { name: 'Vandaag', value: formatDuration(totalToday), inline: true },
      { name: 'Deze week', value: formatDuration(totalWeek), inline: true },
      { name: 'Sessies', value: `${summary.sessionsCount}`, inline: true },
      { name: 'Klassement', value: summary.position.position ? `#${summary.position.position} van ${summary.position.total}` : 'Nog geen plek', inline: true },
      { name: 'Actief sinds', value: summary.active ? (summary.activeSince || 'Onbekend') : 'Niet actief', inline: true },
    ],
  });
}

function createRankingEmbed(createBaseEmbed, guild, ranking, currentUserId = null) {
  const lines = ranking.length
    ? ranking.map((row, index) => `${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`} ${row.display_name || row.username || row.user_id} — ${formatDuration(row.total_seconds)}${String(row.user_id) === String(currentUserId) ? ' • jij' : ''}`).join('\n')
    : 'Er is deze week nog geen activiteit geregistreerd.';

  return createCleanEmbed({
    createBaseEmbed,
    title: `✦ ${guild.name} Klassement ✦`,
    description: 'Overzicht van de meest actieve leden van deze week.',
    fields: [{ name: 'Top 10', value: lines.slice(0, 1024), inline: false }],
  });
}

function createStaffLiveEmbed(createBaseEmbed, activeRows, statsMap) {
  const lines = activeRows.length
    ? activeRows.map((row, index) => {
        const stats = statsMap.get(String(row.user_id)) || {};
        const liveSeconds = Number(stats.liveSeconds || 0);
        const today = Number(stats.todaySeconds || 0) + liveSeconds;
        const week = Number(stats.weekSeconds || 0) + liveSeconds;
        return `**${index + 1}. ${row.display_name || row.username || row.user_id}**\nSinds: ${formatDateTimeNL(row.started_at)}\nVandaag: ${formatDuration(today)}\nWeek: ${formatDuration(week)}\nLaatste check: ${row.last_check_confirmed_at ? formatDateTimeNL(row.last_check_confirmed_at) : 'Nog geen check'}${Number(row.missed_checks || 0) ? `\nWaarschuwingen: ${row.missed_checks}` : ''}`;
      }).join('\n\n')
    : 'Er is momenteel niemand ingeklokt.';

  return createCleanEmbed({
    createBaseEmbed,
    title: '✦ Live activiteitsoverzicht ✦',
    description: 'Alle leden die op dit moment ingeklokt zijn.',
    fields: [{ name: 'Actieve leden', value: lines.slice(0, 1024), inline: false }],
  });
}

function createStaffRankingEmbed(createBaseEmbed, ranking) {
  const lines = ranking.length
    ? ranking.map((row, index) => `${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`} ${row.display_name || row.username || row.user_id} — ${formatDuration(row.total_seconds)} • ${row.sessions_count} sessies`).join('\n')
    : 'Nog geen activiteit geregistreerd.';

  return createCleanEmbed({
    createBaseEmbed,
    title: '✦ Staff klassement ✦',
    description: 'Interne ranglijst van deze week.',
    fields: [{ name: 'Ranglijst', value: lines.slice(0, 1024), inline: false }],
  });
}

module.exports = {
  SlashCommandBuilder,
  EmbedBuilder,
  getActivitySettings,
  getWeekKey,
  parseDbDate,
  formatDuration,
  formatDateTimeNL,
  formatDbDateTimeNL,
  buildPanelButtons,
  buildCheckButtons,
  ensureAllowed,
  isStaff,
  ensureActivityTables,
  getActiveSession,
  clockInMember,
  closeSession,
  getTodaySeconds,
  getWeekSeconds,
  getWeeklyRanking,
  getUserRankingPosition,
  getActiveSessions,
  getMemberActivitySummary,
  createActivityEmbed,
  createRankingEmbed,
  createStaffLiveEmbed,
  createStaffRankingEmbed,
};
