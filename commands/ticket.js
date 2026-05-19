const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const fs = require('fs');
const path = require('path');

const PANEL_CUSTOM_ID = 'ticket:create';
const MODAL_PREFIX = 'ticket:modal:';
const CLAIM_BUTTON_PREFIX = 'ticket:claim:';
const CLOSE_BUTTON_PREFIX = 'ticket:close:';
const ADD_BUTTON_PREFIX = 'ticket:add:';
const REMOVE_BUTTON_PREFIX = 'ticket:remove:';
const REVIEW_SELECT_PREFIX = 'ticket:review:';
const REVIEW_MODAL_PREFIX = 'ticket:reviewmodal:';
const ADD_USER_MODAL_PREFIX = 'ticket:adduser:';
const REMOVE_USER_MODAL_PREFIX = 'ticket:removeuser:';
const CLOSE_MODAL_PREFIX = 'ticket:closemodal:';
const PANEL_STORAGE_KEY = 'ticket_panel';

function getTicketSettings(config) {
  return config?.TICKET_SETTINGS || {};
}

function getTicketCategories(config) {
  return Array.isArray(config?.TICKET_CATEGORIES) ? config.TICKET_CATEGORIES : [];
}

function getSupportRoleIds(config, category = null) {
  const settings = getTicketSettings(config);
  const categoryRoleIds = Array.isArray(category?.supportRoleIds)
    ? category.supportRoleIds.filter(Boolean)
    : [];
  const fallbackRoleIds = [settings.KADER_ROLE_ID, settings.SEMI_KADER_ROLE_ID].filter(Boolean);
  return [...new Set([...categoryRoleIds, ...fallbackRoleIds])];
}

function isSupportMember(member, config) {
  if (!member) return false;
  const supportRoleIds = getSupportRoleIds(config);
  return supportRoleIds.some(roleId => member.roles?.cache?.has(roleId));
}

function sanitizeChannelName(input) {
  return (
    String(input || 'ticket')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\- ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/\-+/g, '-')
      .slice(0, 80) || 'ticket'
  );
}

function getPanelFiles() {
  const files = [];
  const logoPath = path.join(process.cwd(), 'logo.png');
  const bannerPath = path.join(process.cwd(), 'ledenlijst-banner.jpg');

  if (fs.existsSync(logoPath)) {
    files.push(new AttachmentBuilder(logoPath, { name: 'logo.png' }));
  }

  if (fs.existsSync(bannerPath)) {
    files.push(new AttachmentBuilder(bannerPath, { name: 'ledenlijst-banner.jpg' }));
  }

  return files;
}

function buildPanelEmbed(config, createBaseEmbed) {
const settings = getTicketSettings(config);
const kaderMention = settings.KADER_ROLE_ID ? `<@&${settings.KADER_ROLE_ID}>` : '@Kader';
const semiKaderMention = settings.SEMI_KADER_ROLE_ID ? `<@&${settings.SEMI_KADER_ROLE_ID}>` : '@Semi Kader';

const embed = createBaseEmbed({
  title: '🎟️ Vyrkazoz Tickets',
  description: 'Welkom bij het Ticket Systeem van Vyrkazoz | MRP! Kies 1 van de onderstaande categorieën om een ticket te maken!\n\nDe categorieën waar je uit kan kiezen:\n⛔ Klacht Melden\n🤝 Samenwerking\n❓Overige Vragen\n\nVul de vragen zo goed mogelijk in zodat een ' + kaderMention + ' of een ' + semiKaderMention + ' je zo snel mogelijk helpt!',
  image: false,
  thumbnail: 'attachment://logo.png',
});

embed.setImage('attachment://ledenlijst-banner.jpg');
return embed;
}

function buildPanelComponents(config) {
  const categories = getTicketCategories(config);

  const select = new StringSelectMenuBuilder()
    .setCustomId(PANEL_CUSTOM_ID)
    .setPlaceholder('🎟️ Selecteer een ticketcategorie')
    .setMinValues(1)
    .setMaxValues(1);

  if (categories.length > 0) {
    select.addOptions(
      categories.map(category => ({
        label: String(category.label || 'Onbekende categorie').slice(0, 100),
        description: String(category.description || 'Open een ticket').slice(0, 100),
        value: String(category.key),
      }))
    );
  } else {
    select.addOptions({
      label: 'Geen categorieën beschikbaar',
      description: 'Controleer je config.js',
      value: 'no_categories',
    }).setDisabled(true);
  }

  return [new ActionRowBuilder().addComponents(select)];
}

function buildControlButtons(ticketId, closed = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CLAIM_BUTTON_PREFIX}${ticketId}`)
        .setLabel('🤚 Claim')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(closed),
      new ButtonBuilder()
        .setCustomId(`${ADD_BUTTON_PREFIX}${ticketId}`)
        .setLabel('🚪 Toevoegen')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(closed),
      new ButtonBuilder()
        .setCustomId(`${REMOVE_BUTTON_PREFIX}${ticketId}`)
        .setLabel('🗑️ Verwijderen')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(closed),
      new ButtonBuilder()
        .setCustomId(`${CLOSE_BUTTON_PREFIX}${ticketId}`)
        .setLabel('🔒 Sluiten')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(closed)
    ),
  ];
}

function buildReviewRow(ticketId) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${REVIEW_SELECT_PREFIX}${ticketId}`)
        .setPlaceholder('Hoe beoordeel je deze ticket-afhandeling?')
        .addOptions([
          { label: '1 ster', value: '1', description: 'Zeer ontevreden' },
          { label: '2 sterren', value: '2', description: 'Ontevreden' },
          { label: '3 sterren', value: '3', description: 'Neutraal' },
          { label: '4 sterren', value: '4', description: 'Tevreden' },
          { label: '5 sterren', value: '5', description: 'Zeer tevreden' },
        ])
    ),
  ];
}

function buildCategoryModal(category) {
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${category.key}`)
    .setTitle(String(category.label || 'Ticket').slice(0, 45));

  const rows = (Array.isArray(category.questions) ? category.questions : [])
    .slice(0, 5)
    .map((question, index) => {
      const input = new TextInputBuilder()
        .setCustomId(`answer_${index}`)
        .setLabel(String(question).slice(0, 45))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      return new ActionRowBuilder().addComponents(input);
    });

  modal.addComponents(...rows);
  return modal;
}

function buildReviewModal(ticketId, rating) {
  const modal = new ModalBuilder()
    .setCustomId(`${REVIEW_MODAL_PREFIX}${ticketId}:${rating}`)
    .setTitle(`Review ${rating} ster${rating === '1' ? '' : 'ren'}`);

  const input = new TextInputBuilder()
    .setCustomId('review_text')
    .setLabel('Wil je nog iets toelichten?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder('Vertel kort hoe je de hulp hebt ervaren');

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function getTicketById(pool, ticketId) {
  const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ? LIMIT 1', [ticketId]);
  return rows[0] || null;
}

async function getTicketByChannelId(pool, channelId) {
  const [rows] = await pool.execute('SELECT * FROM tickets WHERE channel_id = ? LIMIT 1', [channelId]);
  return rows[0] || null;
}

async function insertTicket(pool, data) {
  const [result] = await pool.execute(
    `INSERT INTO tickets
      (guild_id, channel_id, creator_id, category_key, category_label, channel_name, status, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)`,
    [
      data.guildId,
      data.channelId,
      data.creatorId,
      data.categoryKey,
      data.categoryLabel,
      data.channelName,
    ]
  );

  return result.insertId;
}

async function insertTicketQuestions(pool, ticketId, questions, answers) {
  for (let i = 0; i < questions.length; i += 1) {
    await pool.execute(
      `INSERT INTO ticket_questions (ticket_id, question_label, answer_text, sort_order)
       VALUES (?, ?, ?, ?)`,
      [ticketId, questions[i], answers[i] || null, i]
    );
  }
}

async function addParticipant(pool, ticketId, userId, addedBy = null) {
  await pool.execute(
    `INSERT IGNORE INTO ticket_participants (ticket_id, user_id, added_by)
     VALUES (?, ?, ?)`,
    [ticketId, userId, addedBy]
  );
}

async function removeParticipant(pool, ticketId, userId) {
  await pool.execute(
    'DELETE FROM ticket_participants WHERE ticket_id = ? AND user_id = ?',
    [ticketId, userId]
  );
}

async function touchTicket(pool, ticketId) {
  await pool.execute(
    'UPDATE tickets SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [ticketId]
  );
}

async function setClaim(pool, ticketId, userId) {
  await pool.execute(
    'UPDATE tickets SET claimed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [userId, ticketId]
  );
}

async function closeTicket(pool, ticketId, data) {
  await pool.execute(
    `UPDATE tickets
     SET status = 'closed',
         close_reason = ?,
         close_requested_by = ?,
         closed_by = ?,
         closed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [data.reason || null, data.requestedBy || null, data.closedBy || null, ticketId]
  );
}

async function saveTranscript(pool, ticketId, channelId, htmlBuffer, transcriptMessageId = null) {
  const html = Buffer.isBuffer(htmlBuffer) ? htmlBuffer.toString('utf8') : String(htmlBuffer || '');

  await pool.execute(
    `INSERT INTO ticket_transcripts (ticket_id, channel_id, transcript_html, transcript_text, transcript_message_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       transcript_html = VALUES(transcript_html),
       transcript_text = VALUES(transcript_text),
       transcript_message_id = VALUES(transcript_message_id),
       generated_at = CURRENT_TIMESTAMP`,
    [ticketId, channelId, html, html, transcriptMessageId]
  );
}

async function saveReview(pool, data) {
  await pool.execute(
    `INSERT INTO ticket_reviews
      (ticket_id, guild_id, channel_id, creator_id, rating, review_text, review_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rating = VALUES(rating),
       review_text = VALUES(review_text),
       review_message_id = VALUES(review_message_id),
       created_at = CURRENT_TIMESTAMP`,
    [
      data.ticketId,
      data.guildId,
      data.channelId,
      data.creatorId,
      data.rating,
      data.reviewText || null,
      data.reviewMessageId || null,
    ]
  );
}

async function getStoredPanelMessage(pool, guildId, panelKey) {
  const [rows] = await pool.execute(
    `SELECT guild_id, panel_key, channel_id, message_id
     FROM bot_panel_messages
     WHERE guild_id = ? AND panel_key = ?
     LIMIT 1`,
    [guildId, panelKey]
  );
  return rows[0] || null;
}

async function savePanelMessage(pool, guildId, panelKey, channelId, messageId) {
  await pool.execute(
    `INSERT INTO bot_panel_messages (guild_id, panel_key, channel_id, message_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       channel_id = VALUES(channel_id),
       message_id = VALUES(message_id),
       updated_at = CURRENT_TIMESTAMP`,
    [guildId, panelKey, channelId, messageId]
  );
}

async function deleteStoredPanelMessage(pool, guildId, panelKey) {
  await pool.execute(
    'DELETE FROM bot_panel_messages WHERE guild_id = ? AND panel_key = ?',
    [guildId, panelKey]
  );
}

async function logTicketAction(context, title, description, fields = []) {
  await context.sendLog(
    context.config.LOG_CHANNELS?.ticketLogs,
    context.createLogEmbed({ title, description, fields })
  );
}

async function ensurePanelMessage(context) {
  const { client, config, pool, fetchTextChannel, createBaseEmbed, sendBotLog } = context;
  const settings = getTicketSettings(config);
  const panelChannel = await fetchTextChannel(settings.PANEL_CHANNEL_ID);

  if (!panelChannel) {
    await sendBotLog('✦ 𝑻𝒊𝒄𝒌𝒆𝒕𝒑𝒂𝒏𝒆𝒍 𝒇𝒐𝒖𝒕', 'Het ticket panelkanaal kon niet worden gevonden.');
    return null;
  }

  const guildId = panelChannel.guild.id;
  const embed = buildPanelEmbed(config, createBaseEmbed);
  const components = buildPanelComponents(config);
  const files = getPanelFiles();
  const stored = await getStoredPanelMessage(pool, guildId, PANEL_STORAGE_KEY).catch(() => null);

  if (stored?.message_id) {
    try {
      const existingMessage = await panelChannel.messages.fetch(stored.message_id);
      if (existingMessage && existingMessage.author.id === client.user.id) {
        await existingMessage.edit({ embeds: [embed], components, files });

        if (stored.channel_id !== panelChannel.id) {
          await savePanelMessage(pool, guildId, PANEL_STORAGE_KEY, panelChannel.id, existingMessage.id);
        }

        return existingMessage;
      }
    } catch {
      await deleteStoredPanelMessage(pool, guildId, PANEL_STORAGE_KEY).catch(() => null);
    }
  }

  const sent = await panelChannel.send({ embeds: [embed], components, files });
  await savePanelMessage(pool, guildId, PANEL_STORAGE_KEY, panelChannel.id, sent.id).catch(() => null);
  return sent;
}

async function createTicketChannel(interaction, context, category) {
  const { config } = context;
  const settings = getTicketSettings(config);
  const guild = interaction.guild;
  const creator = interaction.user;

  const baseName = sanitizeChannelName(`${category.channelSuffix || category.key || 'ticket'}-${creator.username}`);
  const channelName = baseName.slice(0, 90);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: creator.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  for (const roleId of getSupportRoleIds(config, category)) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: settings.CATEGORY_ID || null,
    permissionOverwrites: overwrites,
    reason: `Ticket aangemaakt door ${creator.tag}`,
  });
}

async function sendTicketOpeningMessage(channel, interaction, context, category, ticketId, answers) {
  const { config, createBaseEmbed } = context;

  const questionFields = (Array.isArray(category.questions) ? category.questions : []).map((question, index) => ({
    name: `✦ ${String(question).slice(0, 250)}`,
    value: String(answers[index] || 'Geen antwoord opgegeven.').slice(0, 1024),
    inline: false,
  }));

  const embed = createBaseEmbed({
    title: `✦ Ticket #${ticketId} ✦`,
    description:
      `Welkom ${interaction.user}, je ticket is succesvol aangemaakt.\n\n` +
      'Een stafflid zal dit ticket zo snel mogelijk bekijken.',
    fields: [
      { name: '📂 Categorie', value: category.label || 'Onbekend', inline: true },
      { name: '👤 Maker', value: `${interaction.user}`, inline: true },
      { name: '📝 Status', value: 'Open', inline: true },
      ...questionFields,
    ],
    thumbnail: 'attachment://logo.png',
    image: true,
  });

  const supportRoleIds = getSupportRoleIds(config, category);
  const supportMentions = supportRoleIds.map(roleId => `<@&${roleId}>`).join(' ');
  const files = getPanelFiles();

  await channel.send({
    content: `${interaction.user} ${supportMentions}`.trim(),
    embeds: [embed],
    components: buildControlButtons(ticketId, false),
    files,
    allowedMentions: {
      users: [interaction.user.id],
      roles: supportRoleIds,
    },
  });
}

async function generateAndSendTranscript(channel, ticket, context) {
  const transcriptChannelId = context.config.LOG_CHANNELS?.ticketTranscripts;
  if (!transcriptChannelId) return null;

  const transcriptAttachment = await discordTranscripts.createTranscript(channel, {
    limit: -1,
    filename: `ticket-${ticket.id}.html`,
    saveImages: true,
    poweredBy: false,
    footerText: 'Transcript opgeslagen - {number} bericht{suffix}',
  });

  const logChannel = await context.fetchTextChannel(transcriptChannelId);
  let sentMessage = null;

  if (logChannel) {
    const embed = context.createLogEmbed({
      title: '✦ 𝑻𝒊𝒄𝒌𝒆𝒕 𝒕𝒓𝒂𝒏𝒔𝒄𝒓𝒊𝒑𝒕 ✦',
      description: `Transcript opgeslagen van ticket **#${ticket.id}**.`,
      fields: [
        { name: 'Kanaal', value: `<#${ticket.channel_id}>`, inline: true },
        { name: 'Maker', value: `<@${ticket.creator_id}>`, inline: true },
        { name: 'Categorie', value: ticket.category_label || 'Onbekend', inline: true },
      ],
    });

    sentMessage = await logChannel.send({ embeds: [embed], files: [transcriptAttachment] });
  }

  const htmlBuffer = transcriptAttachment.attachment;
  await saveTranscript(context.pool, ticket.id, ticket.channel_id, htmlBuffer, sentMessage?.id || null);
  return sentMessage;
}

async function sendReviewPrompt(user, ticket, context) {
  try {
    const dm = await user.createDM();
    await dm.send({
      embeds: [
        context.createBaseEmbed({
          title: '✦ Ticket Review ✦',
          description:
            `Je ticket **#${ticket.id}** is gesloten.\n\n` +
            'Wil je de afhandeling beoordelen? Selecteer hieronder het aantal sterren.',
        }),
      ],
      components: buildReviewRow(ticket.id),
    });
  } catch (error) {
    await context.sendBotLog(
      '✦ 𝑻𝒊𝒄𝒌𝒆𝒕 𝒓𝒆𝒗𝒊𝒆𝒘 𝒇𝒐𝒖𝒕',
      `Kon geen reviewverzoek sturen naar <@${user.id}>.`,
      [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
    );
  }
}

async function replyEphemeral(interaction, content) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content, ephemeral: true }).catch(() => null);
  }
  return interaction.reply({ content, ephemeral: true }).catch(() => null);
}

async function fetchTicketChannel(guild, channelId) {
  return guild.channels.fetch(channelId).catch(() => null);
}

async function handleCreateTicketModal(interaction, context) {
  const { config, pool } = context;
  const categoryKey = interaction.customId.replace(MODAL_PREFIX, '');
  const category = getTicketCategories(config).find(item => item.key === categoryKey);

  if (!category) {
    await replyEphemeral(interaction, 'Categorie niet gevonden.');
    return true;
  }

  const [existingTickets] = await pool.execute(
    `SELECT * FROM tickets
     WHERE guild_id = ? AND creator_id = ? AND status = 'open'
     LIMIT 1`,
    [interaction.guild.id, interaction.user.id]
  );

  if (existingTickets.length > 0) {
    await replyEphemeral(interaction, `Je hebt al een open ticket: <#${existingTickets[0].channel_id}>`);
    return true;
  }

  const answers = (Array.isArray(category.questions) ? category.questions : []).map((_, index) =>
    interaction.fields.getTextInputValue(`answer_${index}`)?.trim() || ''
  );

  const channel = await createTicketChannel(interaction, context, category);
  const ticketId = await insertTicket(pool, {
    guildId: interaction.guild.id,
    channelId: channel.id,
    creatorId: interaction.user.id,
    categoryKey: category.key,
    categoryLabel: category.label,
    channelName: channel.name,
  });

  await addParticipant(pool, ticketId, interaction.user.id, interaction.user.id);
  await insertTicketQuestions(pool, ticketId, category.questions || [], answers);
  await sendTicketOpeningMessage(channel, interaction, context, category, ticketId, answers);

  await logTicketAction(context, '✦ 𝑻𝒊𝒄𝒌𝒆𝒕 𝒂𝒂𝒏𝒈𝒆𝒎𝒂𝒂𝒌𝒕', 'Er is een nieuw ticket aangemaakt.', [
  { name: 'Ticket', value: `#${ticketId}`, inline: true },
  { name: 'Kanaal', value: `<#${channel.id}>`, inline: true },
  { name: 'Maker', value: interaction.user.tag, inline: true },
  { name: 'Categorie', value: category.label || 'Onbekend', inline: false },
]);

await context.updateServerStats?.(interaction.guild, `Ticket #${ticketId} aangemaakt`).catch(() => null);
await replyEphemeral(interaction, `✅ Je ticket is aangemaakt: ${channel}`);
  return true;
}

async function handleAddUserModal(interaction, context) {
  const ticketId = Number(interaction.customId.replace(ADD_USER_MODAL_PREFIX, ''));
  const ticket = await getTicketById(context.pool, ticketId);

  if (!ticket) {
    await replyEphemeral(interaction, 'Ticket niet gevonden.');
    return true;
  }

  const userId = interaction.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await replyEphemeral(interaction, 'Gebruiker niet gevonden in deze server.');
    return true;
  }

  const channel = await fetchTicketChannel(interaction.guild, ticket.channel_id);
  if (!channel) {
    await replyEphemeral(interaction, 'Ticketkanaal bestaat niet meer.');
    return true;
  }

  await channel.permissionOverwrites.create(member.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  });

  await addParticipant(context.pool, ticketId, member.id, interaction.user.id);
  await touchTicket(context.pool, ticketId);
  await replyEphemeral(interaction, `✅ ${member} is toegevoegd aan ticket #${ticketId}.`);
  return true;
}

async function handleRemoveUserModal(interaction, context) {
  const ticketId = Number(interaction.customId.replace(REMOVE_USER_MODAL_PREFIX, ''));
  const ticket = await getTicketById(context.pool, ticketId);

  if (!ticket) {
    await replyEphemeral(interaction, 'Ticket niet gevonden.');
    return true;
  }

  const userId = interaction.fields.getTextInputValue('user_id').trim().replace(/[<@!>]/g, '');
  if (userId === ticket.creator_id) {
    await replyEphemeral(interaction, 'De maker van het ticket kan niet via deze knop verwijderd worden.');
    return true;
  }

  const channel = await fetchTicketChannel(interaction.guild, ticket.channel_id);
  if (!channel) {
    await replyEphemeral(interaction, 'Ticketkanaal bestaat niet meer.');
    return true;
  }

  await channel.permissionOverwrites.delete(userId).catch(() => null);
  await removeParticipant(context.pool, ticketId, userId);
  await touchTicket(context.pool, ticketId);
  await replyEphemeral(interaction, `✅ Gebruiker met ID \`${userId}\` is verwijderd uit ticket #${ticketId}.`);
  return true;
}

async function handleCloseTicketModal(interaction, context) {
  const ticketId = Number(interaction.customId.replace(CLOSE_MODAL_PREFIX, ''));
  const ticket = await getTicketById(context.pool, ticketId);

  if (!ticket) {
    await replyEphemeral(interaction, 'Ticket niet gevonden.');
    return true;
  }

  const reason = interaction.fields.getTextInputValue('close_reason')?.trim() || 'Geen reden opgegeven.';
  const channel = await fetchTicketChannel(interaction.guild, ticket.channel_id);

  if (!channel) {
    await replyEphemeral(interaction, 'Ticketkanaal bestaat niet meer.');
    return true;
  }

  await closeTicket(context.pool, ticketId, {
    reason,
    requestedBy: interaction.user.id,
    closedBy: interaction.user.id,
  });

  const transcriptMessage = await generateAndSendTranscript(channel, ticket, context).catch(() => null);

  const closeEmbed = context.createBaseEmbed({
    title: `✦ Ticket #${ticketId} gesloten ✦`,
    description: `Dit ticket is gesloten door ${interaction.user}.\n\n**Reden:** ${reason}`,
    thumbnail: 'attachment://logo.png',
    image: true,
  });

  const fetchedMessages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const controlMessage = fetchedMessages?.find(msg =>
    msg.author.id === interaction.client.user.id &&
    msg.components?.length > 0 &&
    msg.components[0]?.components?.some(component =>
      typeof component.customId === 'string' && component.customId.includes(`:${ticketId}`)
    )
  );

  if (controlMessage) {
    await controlMessage.edit({ components: buildControlButtons(ticketId, true) }).catch(() => null);
  }

  await channel.send({ embeds: [closeEmbed], files: getPanelFiles() }).catch(() => null);

  await logTicketAction(context, '✦ 𝑻𝒊𝒄𝒌𝒆𝒕 𝒈𝒆𝒔𝒍𝒐𝒕𝒆𝒏', `Ticket **#${ticketId}** is gesloten.`, [
    { name: 'Door', value: interaction.user.tag, inline: true },
    { name: 'Kanaal', value: `<#${ticket.channel_id}>`, inline: true },
    {
      name: 'Transcript',
      value: transcriptMessage
        ? `[Open transcript](https://discord.com/channels/${interaction.guild.id}/${transcriptMessage.channel.id}/${transcriptMessage.id})`
        : 'Niet verzonden',
      inline: false,
    },
    { name: 'Reden', value: String(reason).slice(0, 1024), inline: false },
  ]);

  const creator = await interaction.client.users.fetch(ticket.creator_id).catch(() => null);
  if (creator) {
    await sendReviewPrompt(creator, ticket, context);
  }

  await context.updateServerStats?.(interaction.guild, `Ticket #${ticketId} gesloten`).catch(() => null);
  await replyEphemeral(interaction, `✅ Ticket #${ticketId} is gesloten. Kanaal wordt over 5 seconden verwijderd.`);

  setTimeout(async () => {
    await channel.delete(`Ticket #${ticketId} gesloten door ${interaction.user.tag}`).catch(() => null);
  }, 5000);

  return true;
}

async function handleReviewModal(interaction, context) {
  const payload = interaction.customId.replace(REVIEW_MODAL_PREFIX, '');
  const [ticketIdRaw, ratingRaw] = payload.split(':');
  const ticketId = Number(ticketIdRaw);
  const rating = Number(ratingRaw);
  const reviewText = interaction.fields.getTextInputValue('review_text')?.trim() || null;

  const ticket = await getTicketById(context.pool, ticketId);
  if (!ticket) {
    await replyEphemeral(interaction, 'Dit ticket bestaat niet meer.');
    return true;
  }

  const reviewChannelId = context.config.LOG_CHANNELS?.ticketReviews;
  let reviewMessageId = null;

  if (reviewChannelId) {
    const reviewChannel = await context.fetchTextChannel(reviewChannelId);
    if (reviewChannel) {
      const reviewEmbed = context.createBaseEmbed({
        title: `✦ Ticket Review #${ticketId} ✦`,
        description: 'Er is een nieuwe ticket review binnengekomen.',
        fields: [
          { name: 'Gebruiker', value: interaction.user.tag, inline: true },
          { name: 'Rating', value: '⭐'.repeat(Math.max(1, Math.min(5, rating))), inline: true },
          { name: 'Categorie', value: ticket.category_label || 'Onbekend', inline: true },
          { name: 'Toelichting', value: reviewText || 'Geen toelichting opgegeven.', inline: false },
        ],
      });

      const message = await reviewChannel.send({ embeds: [reviewEmbed] });
      reviewMessageId = message.id;
    }
  }

  await saveReview(context.pool, {
    ticketId,
    guildId: ticket.guild_id,
    channelId: ticket.channel_id,
    creatorId: interaction.user.id,
    rating,
    reviewText,
    reviewMessageId,
  });

  await replyEphemeral(interaction, '✅ Bedankt voor je review!');
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Beheer het ticketpanel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, context) {
    await ensurePanelMessage(context);
    await interaction.reply({
      content: 'Het ticketpanel is geplaatst of vernieuwd.',
      ephemeral: true,
    });
    return true;
  },

  async postPanel(context) {
    await ensurePanelMessage(context);
    return true;
  },

  async handleComponent(interaction, context) {
    const { config, pool } = context;

    if (interaction.customId === PANEL_CUSTOM_ID) {
      const selectedKey = interaction.values[0];
      if (selectedKey === 'no_categories') {
        await replyEphemeral(interaction, 'Er zijn momenteel geen ticketcategorieën beschikbaar.');
        return true;
      }

      const category = getTicketCategories(config).find(item => item.key === selectedKey);
      if (!category) {
        await replyEphemeral(interaction, 'Deze ticketcategorie bestaat niet meer.');
        return true;
      }

      const existingTicketChannel = await getTicketByChannelId(pool, interaction.channelId).catch(() => null);
      if (existingTicketChannel) {
        await replyEphemeral(interaction, 'Je kunt geen ticket starten vanuit een bestaand ticketkanaal.');
        return true;
      }

      await interaction.showModal(buildCategoryModal(category));
      return true;
    }

    if (interaction.customId.startsWith(REVIEW_SELECT_PREFIX)) {
      const ticketId = interaction.customId.replace(REVIEW_SELECT_PREFIX, '');
      const rating = interaction.values[0];
      await interaction.showModal(buildReviewModal(ticketId, rating));
      return true;
    }

    return false;
  },

  async handleButton(interaction, context) {
    const { pool, config } = context;

    if (interaction.customId.startsWith(CLAIM_BUTTON_PREFIX)) {
      const ticketId = Number(interaction.customId.replace(CLAIM_BUTTON_PREFIX, ''));
      const ticket = await getTicketById(pool, ticketId);

      if (!ticket) {
        await replyEphemeral(interaction, 'Ticket niet gevonden.');
        return true;
      }

      if (!isSupportMember(interaction.member, config)) {
        await replyEphemeral(interaction, 'Alleen Kader of Semi-Kader kan tickets claimen.');
        return true;
      }

      await setClaim(pool, ticketId, interaction.user.id);
      await touchTicket(pool, ticketId);

      await interaction.reply({ content: `✅ Ticket #${ticketId} is geclaimd door ${interaction.user}.` }).catch(() => null);

      await logTicketAction(context, '✦ 𝑻𝒊𝒄𝒌𝒆𝒕 𝒈𝒆𝒄𝒍𝒂𝒊𝒎𝒅', `Ticket **#${ticketId}** is geclaimd.`, [
        { name: 'Ticket', value: String(ticketId), inline: true },
        { name: 'Door', value: interaction.user.tag, inline: true },
      ]);
      return true;
    }

    if (interaction.customId.startsWith(ADD_BUTTON_PREFIX)) {
      const ticketId = Number(interaction.customId.replace(ADD_BUTTON_PREFIX, ''));
      const ticket = await getTicketById(pool, ticketId);

      if (!ticket) {
        await replyEphemeral(interaction, 'Ticket niet gevonden.');
        return true;
      }

      if (!isSupportMember(interaction.member, config)) {
        await replyEphemeral(interaction, 'Alleen Kader of Semi-Kader kan deelnemers toevoegen.');
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${ADD_USER_MODAL_PREFIX}${ticketId}`)
        .setTitle(`Gebruiker toevoegen #${ticketId}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('user_id')
              .setLabel('Discord user ID')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId.startsWith(REMOVE_BUTTON_PREFIX)) {
      const ticketId = Number(interaction.customId.replace(REMOVE_BUTTON_PREFIX, ''));
      const ticket = await getTicketById(pool, ticketId);

      if (!ticket) {
        await replyEphemeral(interaction, 'Ticket niet gevonden.');
        return true;
      }

      if (!isSupportMember(interaction.member, config)) {
        await replyEphemeral(interaction, 'Alleen Kader of Semi-Kader kan deelnemers verwijderen.');
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${REMOVE_USER_MODAL_PREFIX}${ticketId}`)
        .setTitle(`Gebruiker verwijderen #${ticketId}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('user_id')
              .setLabel('Discord user ID')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId.startsWith(CLOSE_BUTTON_PREFIX)) {
      const ticketId = Number(interaction.customId.replace(CLOSE_BUTTON_PREFIX, ''));
      const ticket = await getTicketById(pool, ticketId);

      if (!ticket) {
        await replyEphemeral(interaction, 'Ticket niet gevonden.');
        return true;
      }

      const allowEveryone = getTicketSettings(config).ALLOW_CLOSE_FOR_EVERYONE === true;
      const canClose = allowEveryone || interaction.user.id === ticket.creator_id || isSupportMember(interaction.member, config);

      if (!canClose) {
        await replyEphemeral(interaction, 'Je mag dit ticket niet sluiten.');
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${CLOSE_MODAL_PREFIX}${ticketId}`)
        .setTitle(`Ticket sluiten #${ticketId}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('close_reason')
              .setLabel('Reden van sluiten')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1000)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

    return false;
  },

  async handleModal(interaction, context) {
    if (interaction.customId.startsWith(MODAL_PREFIX)) {
      return handleCreateTicketModal(interaction, context);
    }

    if (interaction.customId.startsWith(ADD_USER_MODAL_PREFIX)) {
      return handleAddUserModal(interaction, context);
    }

    if (interaction.customId.startsWith(REMOVE_USER_MODAL_PREFIX)) {
      return handleRemoveUserModal(interaction, context);
    }

    if (interaction.customId.startsWith(CLOSE_MODAL_PREFIX)) {
      return handleCloseTicketModal(interaction, context);
    }

    if (interaction.customId.startsWith(REVIEW_MODAL_PREFIX)) {
      return handleReviewModal(interaction, context);
    }

    return false;
  },
};