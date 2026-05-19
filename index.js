require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
  AttachmentBuilder,
  Events,
  AuditLogEvent,
  PermissionsBitField
} = require('discord.js');

const config = require('./config');
const { pool, testDatabase } = require('./db');
const activityHelper = require('./activityHelper');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.existsSync(commandsPath)
  ? fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))
  : [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command && 'data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

const bannerPath = path.join(__dirname, 'ledenlijst-banner.jpg');
const memberListMessageCache = new Map();
const updateLocks = new Map();
const recentBanRemovals = new Set();
const scheduledMemberListUpdates = new Map();
const activityMessageCache = new Map();
let activityIntervalsStarted = false;
let weeklyResetTimeout = null;


function createBaseEmbed({
  title,
  description,
  fields = [],
  thumbnail = null,
  image = false,
  color = config.EMBED_COLOR
}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: config.EMBED_FOOTER })
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(config.EMBED_BANNER_URL);

  return embed;
}

function createLogEmbed({ title, description, fields = [], color = config.EMBED_COLOR }) {
  return createBaseEmbed({ title, description, fields, color, image: false });
}

function formatStatus(ok, text) {
  return `${ok ? '✅' : '❌'} ${text}`;
}

function getHighestConfiguredRank(member) {
  for (const rank of config.RANK_ROLES) {
    if (member.roles.cache.has(rank.id)) return rank;
  }
  return null;
}

async function sendLog(channelId, embed) {
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Kon logkanaal ${channelId} niet bereiken:`, error.message);
  }
}

async function sendBotLog(title, description, fields = []) {
  await sendLog(config.LOG_CHANNELS?.botLogs, createLogEmbed({ title, description, fields }));
}

async function fetchTextChannel(channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    return channel && channel.isTextBased() ? channel : null;
  } catch {
    return null;
  }
}

function checkChannelPerms(channel, member) {
  if (!channel || !member) {
    return { view: false, send: false, embed: false, attach: false };
  }

  const perms = channel.permissionsFor(member);

  return {
    view: perms?.has(PermissionsBitField.Flags.ViewChannel) ?? false,
    send: perms?.has(PermissionsBitField.Flags.SendMessages) ?? false,
    embed: perms?.has(PermissionsBitField.Flags.EmbedLinks) ?? false,
    attach: perms?.has(PermissionsBitField.Flags.AttachFiles) ?? false
  };
}

async function getAuditEntry(guild, type, targetId) {
  try {
    const fetched = await guild.fetchAuditLogs({ type, limit: 6 });

    return (
      fetched.entries.find(
        entry =>
          entry.target &&
          entry.target.id === targetId &&
          Date.now() - entry.createdTimestamp < 15000
      ) || null
    );
  } catch (error) {
    await sendBotLog(
      '✦ 𝑨𝒖𝒅𝒊𝒕 𝒍𝒐𝒈 𝒇𝒐𝒖𝒕',
      `Audit logs konden niet worden opgehaald in **${guild.name}**.`,
      [{ name: 'Fout', value: error.message.slice(0, 1024), inline: false }]
    );
    return null;
  }
}

async function applyAutoRole(member) {
  if (!config.AUTO_ROLE_ID) return;

  try {
    const role = await member.guild.roles.fetch(config.AUTO_ROLE_ID).catch(() => null);
    if (!role) return;

    const botMember = member.guild.members.me;
    if (!botMember) return;
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;
    if (role.position >= botMember.roles.highest.position) return;
    if (member.roles.cache.has(role.id)) return;

    await member.roles.add(role.id, 'Automatische autorole bij join');
  } catch (error) {
    await sendBotLog(
      '✦ 𝑨𝒖𝒕𝒐𝒓𝒐𝒍 𝒇𝒐𝒖𝒕',
      `De autorole kon niet worden toegevoegd aan **${member.user.tag}**.`,
      [{ name: 'Fout', value: error.message.slice(0, 1024), inline: false }]
    );
  }
}

async function upsertMemberCache(member) {
  const rank = getHighestConfiguredRank(member);

  await pool.execute(
    `INSERT INTO member_cache (guild_id, user_id, username, display_name, rank_role_id, rank_name, is_bot)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       display_name = VALUES(display_name),
       rank_role_id = VALUES(rank_role_id),
       rank_name = VALUES(rank_name),
       is_bot = VALUES(is_bot),
       updated_at = CURRENT_TIMESTAMP`,
    [
      member.guild.id,
      member.id,
      member.user.tag,
      member.displayName || member.user.username,
      rank?.id || null,
      rank?.name || null,
      member.user.bot ? 1 : 0
    ]
  );
}

async function deleteMemberCache(guildId, userId) {
  await pool.execute('DELETE FROM member_cache WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

async function loadMemberCache(guildId) {
  const [rows] = await pool.execute(
    'SELECT guild_id, user_id, username, display_name, rank_role_id, rank_name, is_bot FROM member_cache WHERE guild_id = ? AND is_bot = 0 ORDER BY updated_at DESC',
    [guildId]
  );
  return rows;
}

async function syncCachedMembersFromGuild(guild) {
  await guild.members.fetch().catch(() => null);

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    await upsertMemberCache(member);
  }
}

async function getOrCreateMemberListMessage(channel) {
  const cachedId = memberListMessageCache.get(channel.id);

  if (cachedId) {
    try {
      return await channel.messages.fetch(cachedId);
    } catch {
      memberListMessageCache.delete(channel.id);
    }
  }

  const messages = await channel.messages.fetch({ limit: 20 });
  const existingMessage = messages.find(
    msg =>
      msg.author.id === client.user.id &&
      msg.embeds.length > 0 &&
      msg.embeds[0].footer &&
      msg.embeds[0].footer.text === config.EMBED_FOOTER
  );

  if (existingMessage) {
    memberListMessageCache.set(channel.id, existingMessage.id);
    return existingMessage;
  }

  const placeholder = await channel.send({
    embeds: [
      createBaseEmbed({
        title: '✦ 𝑳𝒆𝒅𝒆𝒏𝒍𝒊𝒋𝒔𝒕 ✦',
        description: 'De ledenlijst wordt opgebouwd...',
        image: true
      })
    ],
    files: fs.existsSync(bannerPath) ? [new AttachmentBuilder(bannerPath)] : []
  });

  memberListMessageCache.set(channel.id, placeholder.id);
  return placeholder;
}

async function updateMemberList(guild, reason = 'Automatische update') {
  if (!guild || updateLocks.get(guild.id)) return;
  updateLocks.set(guild.id, true);

  try {
    const channel = await fetchTextChannel(config.MEMBER_LIST_CHANNEL_ID);
    if (!channel) {
      await sendBotLog(
        '✦ 𝑳𝒆𝒅𝒆𝒏𝒍𝒊𝒋𝒔𝒕 𝒇𝒐𝒖𝒕',
        'Het ledenlijstkanaal kon niet worden gevonden of is niet tekstgebaseerd.'
      );
      return;
    }

    await syncCachedMembersFromGuild(guild);
    const rows = await loadMemberCache(guild.id);
    const fields = [];
    const totalMembers = new Set();

    for (const rank of config.RANK_ROLES) {
      const members = rows.filter(row => row.rank_role_id === rank.id);
      members.forEach(member => totalMembers.add(member.user_id));

      let value = 'Geen leden met deze rang.';
      if (members.length > 0) {
        const mentions = members.map(member => `<@${member.user_id}>`);
        let current = '';

        for (const mention of mentions) {
          const candidate = current ? `${current}\n${mention}` : mention;
          if (candidate.length > 1024) break;
          current = candidate;
        }

        value = current || 'Geen leden met deze rang.';
      }

      fields.push({
        name: rank.name,
        value,
        inline: false
      });
    }

    const embed = createBaseEmbed({
      title: `✦ ${config.SERVER_NAME} 𝑳𝒆𝒅𝒆𝒏𝒍𝒊𝒋𝒔𝒕 ✦`,
      description: `Totaal aantal leden met een rang: **${totalMembers.size}**\n\nDit is een overzicht van alle leden, gesorteerd per rang.`,
      fields,
      image: true
    });

    const targetMessage = await getOrCreateMemberListMessage(channel);

    await targetMessage.edit({
      embeds: [embed],
      files: fs.existsSync(bannerPath) ? [new AttachmentBuilder(bannerPath)] : []
    });

    await sendBotLog(
      '✦ 𝑳𝒆𝒅𝒆𝒏𝒍𝒊𝒋𝒔𝒕 𝒃𝒊𝒋𝒈𝒆𝒘𝒆𝒓𝒌𝒕',
      `De ledenlijst is bijgewerkt in **${guild.name}**.`,
      [
        { name: 'Reden', value: reason, inline: false },
        { name: 'Totaal gerangschikte leden', value: String(totalMembers.size), inline: true }
      ]
    );
  } catch (error) {
    console.error('Fout bij het updaten van de ledenlijst:', error);
    await sendBotLog(
      '✦ 𝑳𝒆𝒅𝒆𝒏𝒍𝒊𝒋𝒔𝒕 𝒇𝒐𝒖𝒕',
      'Er ging iets mis bij het updaten van de ledenlijst.',
      [{ name: 'Fout', value: error.message.slice(0, 1024), inline: false }]
    );
  } finally {
    updateLocks.set(guild.id, false);
  }
}

function queueMemberListUpdate(guild, reason = 'Geplande update', delay = 10000) {
  if (!guild) return;

  const existingTimeout = scheduledMemberListUpdates.get(guild.id);
  if (existingTimeout) clearTimeout(existingTimeout);

  const timeout = setTimeout(async () => {
    scheduledMemberListUpdates.delete(guild.id);
    await updateMemberList(guild, reason);
  }, delay);

  scheduledMemberListUpdates.set(guild.id, timeout);
}

function startMemberListLoop() {
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      queueMemberListUpdate(guild, 'Periodieke refresh', 5000);
    }
  }, config.MEMBER_LIST_UPDATE_INTERVAL_MS || 1800000);
}


async function upsertActivityPanelRecord(guildId, patch = {}) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const fields = ['guild_id', ...keys];
  const placeholders = fields.map(() => '?').join(', ');
  const updates = keys.map(key => `${key} = VALUES(${key})`).join(', ');
  const values = [guildId, ...keys.map(key => patch[key])];
  await pool.execute(`INSERT INTO activity_panels (${fields.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`, values);
}

async function getActivityPanelRecord(guildId) {
  const [rows] = await pool.execute('SELECT * FROM activity_panels WHERE guild_id = ? LIMIT 1', [guildId]);
  return rows[0] || null;
}

async function ensureActivityMessage(channel, messageId, payload) {
  if (!channel) return null;
  const cacheKey = `${channel.id}:${messageId || 'new'}`;
  const fingerprint = JSON.stringify({
    embeds: (payload.embeds || []).map(embed => embed.toJSON()),
    components: (payload.components || []).map(row => row.toJSON ? row.toJSON() : row)
  });

  try {
    if (messageId) {
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (message) {
        const oldPrint = activityMessageCache.get(cacheKey);
        if (oldPrint !== fingerprint) {
          await message.edit(payload);
          activityMessageCache.set(cacheKey, fingerprint);
        }
        return message;
      }
    }

    const message = await channel.send(payload);
    activityMessageCache.set(`${channel.id}:${message.id}`, fingerprint);
    return message;
  } catch (error) {
    console.error('Activity message fout:', error);
    await sendBotLog(
      '✦ Activiteit paneel fout ✦',
      'Er ging iets mis bij het aanmaken of updaten van een activiteitbericht.',
      [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
    );
    return null;
  }
}

async function refreshActivityPanels(guild, reason = 'Automatische update') {
  if (!guild) return;
  const settings = config.ACTIVITY_SETTINGS || {};
  if (!settings.PANEL_CHANNEL_ID || !settings.STAFF_CHANNEL_ID) return;

  const panelChannel = await fetchTextChannel(settings.PANEL_CHANNEL_ID);
  const staffChannel = await fetchTextChannel(settings.STAFF_CHANNEL_ID);
  if (!panelChannel || !staffChannel) return;

  const panelRecord = await getActivityPanelRecord(guild.id);
  const ranking = await activityHelper.getWeeklyRanking(pool, guild.id, 10);
  const activeRows = await activityHelper.getActiveSessions(pool, guild.id);
  const statsMap = new Map();

  for (const row of activeRows) {
    const summary = await activityHelper.getMemberActivitySummary(pool, guild.id, row.user_id);
    statsMap.set(String(row.user_id), summary);
  }

  const publicEmbed = createBaseEmbed({
    title: '✦ Activiteitssysteem ✦',
    description: 'Klok in wanneer je begint en klok uit zodra je klaar bent. Jouw activiteit wordt automatisch bijgehouden.',
    image: true
  });

  const publicMessage = await ensureActivityMessage(panelChannel, panelRecord?.panel_message_id, {
    embeds: [publicEmbed],
    components: activityHelper.buildPanelButtons(false)
  });

  const liveMessage = await ensureActivityMessage(staffChannel, panelRecord?.staff_live_message_id, {
    embeds: [activityHelper.createStaffLiveEmbed(createBaseEmbed, activeRows, statsMap)]
  });

  const rankMessage = await ensureActivityMessage(staffChannel, panelRecord?.staff_rank_message_id, {
    embeds: [activityHelper.createStaffRankingEmbed(createBaseEmbed, ranking)]
  });

  await upsertActivityPanelRecord(guild.id, {
    panel_channel_id: panelChannel.id,
    panel_message_id: publicMessage?.id || null,
    staff_channel_id: staffChannel.id,
    staff_live_message_id: liveMessage?.id || null,
    staff_rank_message_id: rankMessage?.id || null
  });
}

async function runActivityCheckCycle(guild) {
  if (!guild) return;
  const settings = config.ACTIVITY_SETTINGS || {};
  const activeRows = await activityHelper.getActiveSessions(pool, guild.id);
  const minIntervalMinutes = Math.max(15, Number(settings.CHECK_INTERVAL_MINUTES || 30));
  const responseMinutes = Math.max(5, Number(settings.CHECK_RESPONSE_MINUTES || 5));
  const nowUnix = Math.floor(Date.now() / 1000);

  for (const row of activeRows) {
    const lastConfirmUnix = Number(row.last_check_confirmed_at_unix || row.started_at_unix || 0);
    const checkSentUnix = Number(row.check_sent_at_unix || 0);
    const checkDeadlineUnix = Number(row.check_deadline_at_unix || 0);

    const shouldSendCheck = !checkSentUnix && !checkDeadlineUnix && lastConfirmUnix > 0 && (nowUnix - lastConfirmUnix >= minIntervalMinutes * 60);
    const shouldTimeout = !!checkDeadlineUnix && nowUnix > checkDeadlineUnix;

    if (shouldSendCheck) {
      try {
        const user = await client.users.fetch(row.user_id).catch(() => null);
        if (user) {
          await user.send({
            content: `Ben je nog actief? Bevestig binnen ${responseMinutes} minuten om ingeklokt te blijven.`,
            components: activityHelper.buildCheckButtons(row.id)
          });
        }

        const now = new Date();
        const sentUnix = Math.floor(now.getTime() / 1000);
        const deadlineUnix = sentUnix + (responseMinutes * 60);
        const sentStamp = now.toISOString().slice(0, 19).replace('T', ' ');
        const deadlineStamp = new Date(deadlineUnix * 1000).toISOString().slice(0, 19).replace('T', ' ');

        await pool.execute(
          "UPDATE activity_sessions SET check_sent_at = ?, check_deadline_at = ?, check_sent_at_unix = ?, check_deadline_at_unix = ?, missed_checks = missed_checks + 1 WHERE id = ? AND status = 'active'",
          [sentStamp, deadlineStamp, sentUnix, deadlineUnix, row.id]
        );
      } catch (error) {
        await sendBotLog(
          '✦ Activiteit DM fout ✦',
          'Er ging iets mis bij het versturen van een activiteit DM-check.',
          [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
        );
      }
      continue;
    }

    if (shouldTimeout) {
      const result = await activityHelper.closeSession({
        pool,
        guildId: guild.id,
        userId: row.user_id,
        actorId: client.user.id,
        status: 'auto_timeout',
        endReason: 'Geen reactie op DM controlecheck'
      });

      if (result.ok) {
        await sendLog(
          settings.LOG_CHANNEL_ID,
          createLogEmbed({
            title: '✦ Lid automatisch uitgeklokt ✦',
            description: `Gebruiker <@${row.user_id}> is automatisch uitgeklokt na geen reactie op DM-check.`
          })
        );
      }
    }
  }

  await refreshActivityPanels(guild, 'Controle verwerkt');
}

async function scheduleWeeklyActivityReset(guild) {
  if (weeklyResetTimeout) clearTimeout(weeklyResetTimeout);
  if (!guild) return;

  const settings = config.ACTIVITY_SETTINGS || {};
  const targetDay = Number(settings.WEEKLY_RESET_DAY || 1);
  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 0, 10, 0);

  while (next.getDay() !== targetDay || next <= now) {
    next.setDate(next.getDate() + 1);
  }

  weeklyResetTimeout = setTimeout(async () => {
    try {
      await pool.execute('DELETE FROM activity_weekly_stats WHERE guild_id = ?', [guild.id]);
      await refreshActivityPanels(guild, 'Wekelijkse reset');
      await sendBotLog('✦ Activiteit weekreset ✦', `Het weekklassement is gereset voor **${guild.name}**.`);
    } catch (error) {
      await sendBotLog(
        '✦ Activiteit reset fout ✦',
        'Er ging iets mis tijdens de wekelijkse reset van het inkloksysteem.',
        [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
      );
    }

    await scheduleWeeklyActivityReset(guild);
  }, Math.max(1000, next.getTime() - now.getTime()));
}

function startActivityIntervals(guild) {
  if (activityIntervalsStarted || !guild) return;
  activityIntervalsStarted = true;

  setInterval(() => {
    refreshActivityPanels(guild, 'Interval verversing').catch(error => console.error('refreshActivityPanels fout:', error));
  }, 2 * 60 * 1000);

  setInterval(() => {
    runActivityCheckCycle(guild).catch(error => console.error('runActivityCheckCycle fout:', error));
  }, 2 * 60 * 1000);

  scheduleWeeklyActivityReset(guild).catch(() => null);
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`Ingelogd als ${readyClient.user.tag}`);

  try {
    await testDatabase();
    await sendBotLog(
      '✦ 𝑩𝒐𝒕 𝒈𝒆𝒔𝒕𝒂𝒓𝒕',
      `Bot is succesvol ingelogd als **${readyClient.user.tag}** en MySQL is verbonden.`
    );
  } catch (error) {
    console.error('Database connectie mislukt:', error);
    await sendBotLog(
      '✦ 𝑫𝒂𝒕𝒂𝒃𝒂𝒔𝒆 𝒇𝒐𝒖𝒕',
      'De bot is gestart, maar de databaseverbinding is mislukt.',
      [{ name: 'Fout', value: error.message.slice(0, 1024), inline: false }]
    );
  }

  for (const guild of readyClient.guilds.cache.values()) {
    queueMemberListUpdate(guild, 'Bot opgestart', 5000);
  }

  try {
    await activityHelper.ensureActivityTables(pool);
    const mainGuild = readyClient.guilds.cache.get(config.GUILD_ID) || readyClient.guilds.cache.first();
    await refreshActivityPanels(mainGuild, 'Bot opgestart');
    startActivityIntervals(mainGuild);
  } catch (error) {
    console.error('Activiteit systeem startfout:', error);
    await sendBotLog(
      '✦ Activiteit systeem fout ✦',
      'Het inkloksysteem kon niet volledig worden gestart.',
      [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
    );
  }

  startMemberListLoop();
});

client.on('guildMemberAdd', async member => {
  const count = member.guild.memberCount;

  await applyAutoRole(member);
  await upsertMemberCache(member);

  const embed = createBaseEmbed({
    title: '✦ 𝑾𝒆𝒍𝒌𝒐𝒎 𝒃𝒊𝒋 𝙑𝙮𝙧𝙠𝙖𝙯𝙤𝒛 ✦',
    description:
      `Hey ${member}, welkom in **${config.SERVER_NAME}**.\n\n` +
      `Hou <#${config.RP_MOMENTEN_CHANNEL_ID}> goed in de gaten voor onze RP scenario's.\n\n` +
      `Vergeet ook zeker niet onze <#${config.LINKING_CHANNEL_ID}> te checken!\n\n` +
      `Heb je vragen of wil je hulp, maak dan gerust een <#${config.TICKET_CHANNEL_ID}> aan.\n\n` +
      `We zijn nu met **${count}** leden in de server.`,
    thumbnail: member.displayAvatarURL({ forceStatic: false }),
    image: true
  });

  try {
    const welcomeChannel = await fetchTextChannel(config.WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      await welcomeChannel.send({
        embeds: [embed],
        files: fs.existsSync(bannerPath) ? [new AttachmentBuilder(bannerPath)] : []
      });
    }
  } catch (error) {
    await sendBotLog(
      '✦ 𝑾𝒆𝒍𝒌𝒐𝒎 𝒇𝒐𝒖𝒕',
      'Welkombericht kon niet worden verstuurd.',
      [{ name: 'Fout', value: error.message.slice(0, 1024), inline: false }]
    );
  }

  await sendLog(
    config.LOG_CHANNELS?.memberJoin,
    createLogEmbed({
      title: '✦ 𝑳𝒊𝒅 𝒈𝒆𝒋𝒐𝒊𝒏𝒅',
      description: `${member} is de server binnengekomen.`,
      fields: [
        { name: 'Gebruiker', value: member.user.tag, inline: true },
        { name: 'ID', value: member.id, inline: true },
        { name: 'Leden', value: String(count), inline: true }
      ]
    })
  );

  queueMemberListUpdate(member.guild, 'Nieuw lid gejoint');
});

client.on('guildMemberRemove', async member => {
  await deleteMemberCache(member.guild.id, member.id);

  if (recentBanRemovals.has(member.id)) {
    recentBanRemovals.delete(member.id);
    queueMemberListUpdate(member.guild, 'Gebande gebruiker verwijderd uit ledenlijst');
    return;
  }

  const kickEntry = await getAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);

  if (kickEntry) {
    await sendLog(
      config.LOG_CHANNELS?.memberKick,
      createLogEmbed({
        title: '✦ 𝑳𝒊𝒅 𝒈𝒆𝒌𝒊𝒄𝒌𝒕',
        description: `${member.user.tag} is uit de server gekickt.`,
        fields: [
          { name: 'Gebruiker', value: member.user.tag, inline: true },
          { name: 'ID', value: member.id, inline: true },
          { name: 'Door', value: kickEntry.executor ? kickEntry.executor.tag : 'Onbekend', inline: true },
          { name: 'Reden', value: kickEntry.reason || 'Geen reden opgegeven.', inline: false }
        ]
      })
    );
  } else {
    await sendLog(
      config.LOG_CHANNELS?.memberLeave,
      createLogEmbed({
        title: '✦ 𝑳𝒊𝒅 𝒗𝒆𝒓𝒕𝒓𝒐𝒌𝒌𝒆𝒏',
        description: `${member.user.tag} heeft de server verlaten.`,
        fields: [
          { name: 'Gebruiker', value: member.user.tag, inline: true },
          { name: 'ID', value: member.id, inline: true }
        ]
      })
    );
  }

  queueMemberListUpdate(member.guild, 'Lid verwijderd of vertrokken');
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (
    oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp &&
    newMember.isCommunicationDisabled()
  ) {
    const timeoutEntry = await getAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);

    await sendLog(
      config.LOG_CHANNELS?.memberTimeout,
      createLogEmbed({
        title: '✦ 𝑳𝒊𝒅 𝒈𝒆𝒕𝒊𝒎𝒆𝒐𝒖𝒕',
        description: `${newMember.user.tag} heeft een timeout gekregen.`,
        fields: [
          { name: 'Gebruiker', value: newMember.user.tag, inline: true },
          { name: 'Door', value: timeoutEntry?.executor?.tag || 'Onbekend', inline: true },
          {
            name: 'Tot',
            value: newMember.communicationDisabledUntil
              ? newMember.communicationDisabledUntil.toISOString()
              : 'Onbekend',
            inline: false
          }
        ]
      })
    );
  }

  await upsertMemberCache(newMember);

  const oldIds = [...oldMember.roles.cache.keys()].sort().join(',');
  const newIds = [...newMember.roles.cache.keys()].sort().join(',');

  if (oldIds !== newIds) {
    queueMemberListUpdate(newMember.guild, `Rollen gewijzigd voor ${newMember.user.tag}`);
  }
});

client.on('guildBanAdd', async ban => {
  recentBanRemovals.add(ban.user.id);
  setTimeout(() => recentBanRemovals.delete(ban.user.id), 20000);

  await deleteMemberCache(ban.guild.id, ban.user.id);

  const banEntry = await getAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);

  await sendLog(
    config.LOG_CHANNELS?.memberBan,
    createLogEmbed({
      title: '✦ 𝑳𝒊𝒅 𝒈𝒆𝒃𝒂𝒏𝒅',
      description: `${ban.user.tag} is verbannen uit de server.`,
      fields: [
        { name: 'ID', value: ban.user.id, inline: true },
        { name: 'Door', value: banEntry?.executor?.tag || 'Onbekend', inline: true },
        { name: 'Reden', value: banEntry?.reason || 'Geen reden opgegeven.', inline: false }
      ]
    })
  );

  queueMemberListUpdate(ban.guild, 'Lid geband');
});

client.on('guildBanRemove', async ban => {
  const unbanEntry = await getAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);

  await sendLog(
    config.LOG_CHANNELS?.memberUnban,
    createLogEmbed({
      title: '✦ 𝑳𝒊𝒅 𝒐𝒏𝒕𝒃𝒂𝒏𝒅',
      description: `${ban.user.tag} is weer toegelaten tot de server.`,
      fields: [
        { name: 'ID', value: ban.user.id, inline: true },
        { name: 'Door', value: unbanEntry?.executor?.tag || 'Onbekend', inline: true }
      ]
    })
  );
});

client.on('messageDelete', async message => {
  if (!message.guild || !message.author || message.author.bot || !message.content) return;

  await sendLog(
    config.LOG_CHANNELS?.messageEditDelete,
    createLogEmbed({
      title: '✦ 𝑩𝒆𝒓𝒊𝒄𝒉𝒕 𝒗𝒆𝒓𝒘𝒊𝒋𝒅𝒆𝒓𝒅',
      description: `Er is een bericht verwijderd in ${message.channel}.`,
      fields: [
        { name: 'Auteur', value: message.author.tag, inline: true },
        { name: 'Kanaal', value: `${message.channel}`, inline: true },
        { name: 'Inhoud', value: message.content.slice(0, 1024), inline: false }
      ]
    })
  );
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;

  const before = oldMessage.content || '*Geen tekst*';
  const after = newMessage.content || '*Geen tekst*';
  if (before === after) return;

  await sendLog(
    config.LOG_CHANNELS?.messageEditDelete,
    createLogEmbed({
      title: '✦ 𝑩𝒆𝒓𝒊𝒄𝒉𝒕 𝒃𝒆𝒘𝒆𝒓𝒌𝒕',
      description: `Er is een bericht aangepast in ${newMessage.channel}.`,
      fields: [
        { name: 'Auteur', value: newMessage.author.tag, inline: true },
        { name: 'Voor', value: before.slice(0, 1024), inline: false },
        { name: 'Na', value: after.slice(0, 1024), inline: false }
      ]
    })
  );
});

client.on('messageCreate', async message => {
  if (!message.guild || !message.author || message.author.bot) return;

  if (/https?:\/\/\S+/i.test(message.content)) {
    await sendLog(
      config.LOG_CHANNELS?.linkDelete,
      createLogEmbed({
        title: '✦ 𝑳𝒊𝒏𝒌 𝒈𝒆𝒅𝒆𝒕𝒆𝒄𝒕𝒆𝒆𝒓𝒅',
        description: `Er is een bericht met een link geplaatst in ${message.channel}.`,
        fields: [
          { name: 'Auteur', value: message.author.tag, inline: true },
          { name: 'Inhoud', value: message.content.slice(0, 1024), inline: false }
        ]
      })
    );
  }
});

client.on('interactionCreate', async interaction => {
  try {
    const context = {
      client,
      config,
      pool,
      bannerPath,
      createBaseEmbed,
      createLogEmbed,
      sendBotLog,
      sendLog,
      fetchTextChannel,
      checkChannelPerms,
      formatStatus,
      queueMemberListUpdate,
      refreshTicketPanel,
      updateServerStats,
      queueAfwezigheidUpdate,
      updateAfwezigheidPanels,
      refreshAfwezigheidPublicPanel,
      refreshAfwezigPublicPanel,
      refreshAfwezigheidOverviewPanel,
      processAfwezigheden,
      activityHelper,
      refreshActivityPanels,
      runActivityCheckCycle,
      startActivityIntervals
    };

    if (interaction.isButton() && interaction.customId.startsWith('activity_confirm_check:')) {
      const sessionId = interaction.customId.split(':')[1];
      const now = new Date();
      const confirmedUnix = Math.floor(now.getTime() / 1000);
      const confirmedStamp = now.toISOString().slice(0, 19).replace('T', ' ');
      await pool.execute(
        "UPDATE activity_sessions SET check_sent_at = NULL, check_deadline_at = NULL, check_sent_at_unix = NULL, check_deadline_at_unix = NULL, last_check_confirmed_at = ?, last_check_confirmed_at_unix = ?, missed_checks = 0 WHERE id = ? AND status = 'active'",
        [confirmedStamp, confirmedUnix, sessionId]
      );
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
      await interaction.editReply({ content: 'Check bevestigd. Je blijft ingeklokt.' });
      await refreshActivityPanels(interaction.guild, 'DM-check bevestigd');
      return;
    }

    if (interaction.isButton()) {
      for (const command of client.commands.values()) {
        if (typeof command.handleButton !== 'function') continue;

        const handled = await command.handleButton(interaction, context);
        if (handled) return;
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction, context);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      for (const command of client.commands.values()) {
        if (typeof command.handleComponent !== 'function') continue;

        const handled = await command.handleComponent(interaction, context);
        if (handled) return;
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      for (const command of client.commands.values()) {
        if (typeof command.handleModal !== 'function') continue;

        const handled = await command.handleModal(interaction, context);
        if (handled) return;
      }
    }
  } catch (error) {
    console.error(error);

    const content = 'Er ging iets mis tijdens het uitvoeren van deze actie.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => null);
    } else {
      await interaction.reply({ content, ephemeral: true }).catch(() => null);
    }
  }
});

if (!config.TOKEN) {
  console.error('Fout: DISCORD_BOT_TOKEN of TOKEN ontbreekt in je .env bestand.');
  process.exit(1);
}

client.login(config.TOKEN);