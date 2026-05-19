const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

function hasStaffRole(member, config) {
  if (!member || !member.roles?.cache) return false;
  return Array.isArray(config.RANK_ROLES) && config.RANK_ROLES.some(rank => member.roles.cache.has(rank.id));
}

function getTypeLabel(type) {
  const labels = {
    persoonlijk: '👤 Persoonlijk',
    vakantie: '🌴 Vakantie',
    familie: '👨‍👩‍👧 Familie omstandigheden',
    werk: '💼 Werk',
    school: '📚 School',
  };
  return labels[type] || type;
}

function formatDutchDateTime(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return 'Ongeldige datum';

  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDutchDateTimeDisplay(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return 'Ongeldige datum';

  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function parseDutchDateTime(input) {
  const value = String(input || '').trim();
  const match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hour = hourRaw != null ? Number(hourRaw) : 0;
  const minute = minuteRaw != null ? Number(minuteRaw) : 0;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) return null;

  return date;
}

async function getOpenAfwezigheid(pool, guildId, userId) {
  const [rows] = await pool.execute(
    `SELECT *
     FROM afwezigheden
     WHERE guild_id = ? AND user_id = ? AND status IN ('planned', 'active')
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, userId]
  );
  return rows[0] || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mijnafwezigheid')
    .setDescription('Bekijk en beheer jouw afwezigheid.'),

  async execute(interaction, { config, createBaseEmbed, pool }) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Dit commando kan alleen in een server.', ephemeral: true });
      return true;
    }

    if (!hasStaffRole(interaction.member, config)) {
      await interaction.reply({
        embeds: [createBaseEmbed({ title: 'Geen toegang', description: 'Jij hebt geen toegang tot dit commando.' })],
        ephemeral: true,
      });
      return true;
    }

    const row = await getOpenAfwezigheid(pool, interaction.guild.id, interaction.user.id);

    if (!row) {
      await interaction.reply({
        embeds: [createBaseEmbed({ title: 'Geen afwezigheid gevonden', description: 'Je hebt momenteel geen actieve of geplande afwezigheid.' })],
        ephemeral: true,
      });
      return true;
    }

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`afwezigheid_edit:${row.id}:${interaction.user.id}`).setLabel('Aanpassen').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`afwezigheid_extend:${row.id}:${interaction.user.id}`).setLabel('Verlengen').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`afwezigheid_cancel:${row.id}:${interaction.user.id}`).setLabel('Annuleren').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: 'Mijn afwezigheid',
          description: 'Hieronder zie je jouw huidige afwezigheid.',
          thumbnail: interaction.user.displayAvatarURL({ forceStatic: false }),
          fields: [
            { name: 'Type', value: getTypeLabel(row.type), inline: true },
            { name: 'Status', value: row.status === 'active' ? 'Actief' : 'Gepland', inline: true },
            { name: 'Van', value: formatDutchDateTimeDisplay(row.start_at), inline: true },
            { name: 'Tot', value: formatDutchDateTimeDisplay(row.end_at), inline: true },
            { name: 'Reden', value: String(row.reason || 'Geen reden').slice(0, 1024), inline: false },
          ],
        }),
      ],
      components: [buttons],
      ephemeral: true,
    });

    return true;
  },

  async handleButton(interaction, {
    config,
    pool,
    createBaseEmbed,
    createLogEmbed,
    sendLog,
    refreshAfwezigheidPublicPanel,
    refreshAfwezigheidOverviewPanel,
  }) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith('afwezigheid_')) return false;

    const [action, recordId, ownerId] = interaction.customId.split(':');

    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Alleen jij kunt deze knoppen gebruiken.', ephemeral: true });
      return true;
    }

    if (!hasStaffRole(interaction.member, config)) {
      await interaction.reply({ content: 'Je hebt hier geen rechten voor.', ephemeral: true });
      return true;
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM afwezigheden
       WHERE id = ? AND guild_id = ? AND user_id = ? AND status IN ('planned', 'active')
       LIMIT 1`,
      [recordId, interaction.guild.id, interaction.user.id]
    );

    const row = rows[0] || null;

    if (!row) {
      await interaction.reply({ content: 'Afwezigheid niet gevonden.', ephemeral: true });
      return true;
    }

    if (action === 'afwezigheid_cancel') {
      await pool.execute(
        `UPDATE afwezigheden
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.id]
      );

      await sendLog(
        config.AFWEZIGHEID_SETTINGS?.LOG_CHANNEL_ID,
        createLogEmbed({
          title: '✦ Afwezigheid geannuleerd',
          description: `${interaction.user.tag} heeft een afwezigheid geannuleerd.`,
          fields: [
            { name: 'Type', value: getTypeLabel(row.type), inline: true },
            { name: 'Van', value: formatDutchDateTimeDisplay(row.start_at), inline: true },
            { name: 'Tot', value: formatDutchDateTimeDisplay(row.end_at), inline: true },
          ],
        })
      );

      await refreshAfwezigheidPublicPanel(interaction.guild, 'Afwezigheid geannuleerd');
      await refreshAfwezigheidOverviewPanel(interaction.guild, 'Afwezigheid geannuleerd');

      await interaction.reply({
        embeds: [createBaseEmbed({ title: 'Afwezigheid geannuleerd', description: 'Jouw afwezigheid is geannuleerd.' })],
        ephemeral: true,
      });

      return true;
    }

    if (action === 'afwezigheid_edit') {
      const modal = new ModalBuilder()
        .setCustomId(`afwezigheid_edit_modal:${row.id}:${interaction.user.id}`)
        .setTitle('Afwezigheid aanpassen');

      const vanInput = new TextInputBuilder()
        .setCustomId('van')
        .setLabel('Van (dd-mm-jjjj uu:mm)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(formatDutchDateTime(row.start_at));

      const totInput = new TextInputBuilder()
        .setCustomId('tot')
        .setLabel('Tot (dd-mm-jjjj uu:mm)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(formatDutchDateTime(row.end_at));

      const redenInput = new TextInputBuilder()
        .setCustomId('reden')
        .setLabel('Reden')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(String(row.reason || '').slice(0, 1000));

      modal.addComponents(
        new ActionRowBuilder().addComponents(vanInput),
        new ActionRowBuilder().addComponents(totInput),
        new ActionRowBuilder().addComponents(redenInput)
      );

      await interaction.showModal(modal);
      return true;
    }

    if (action === 'afwezigheid_extend') {
      const modal = new ModalBuilder()
        .setCustomId(`afwezigheid_extend_modal:${row.id}:${interaction.user.id}`)
        .setTitle('Afwezigheid verlengen');

      const totInput = new TextInputBuilder()
        .setCustomId('tot')
        .setLabel('Nieuwe einddatum (dd-mm-jjjj uu:mm)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(totInput));

      await interaction.showModal(modal);
      return true;
    }

    return false;
  },

  async handleModal(interaction, {
    config,
    pool,
    createBaseEmbed,
    createLogEmbed,
    sendLog,
    refreshAfwezigheidPublicPanel,
    refreshAfwezigheidOverviewPanel,
  }) {
    if (!interaction.isModalSubmit()) return false;
    if (
      !interaction.customId.startsWith('afwezigheid_edit_modal:') &&
      !interaction.customId.startsWith('afwezigheid_extend_modal:')
    ) {
      return false;
    }

    const parts = interaction.customId.split(':');
    const modalType = parts[0];
    const recordId = parts[1];
    const ownerId = parts[2];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Dit formulier is niet voor jou.', ephemeral: true });
      return true;
    }

    if (!hasStaffRole(interaction.member, config)) {
      await interaction.reply({ content: 'Je hebt hier geen rechten voor.', ephemeral: true });
      return true;
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM afwezigheden
       WHERE id = ? AND guild_id = ? AND user_id = ? AND status IN ('planned', 'active')
       LIMIT 1`,
      [recordId, interaction.guild.id, interaction.user.id]
    );

    const row = rows[0] || null;

    if (!row) {
      await interaction.reply({ content: 'Afwezigheid niet gevonden.', ephemeral: true });
      return true;
    }

    if (modalType === 'afwezigheid_edit_modal') {
      const startAt = parseDutchDateTime(interaction.fields.getTextInputValue('van'));
      const endAt = parseDutchDateTime(interaction.fields.getTextInputValue('tot'));
      const reden = interaction.fields.getTextInputValue('reden').trim();

      if (!startAt || !endAt || endAt <= startAt) {
        await interaction.reply({
          embeds: [createBaseEmbed({ title: 'Ongeldige invoer', description: 'Controleer de start- en einddatum.' })],
          ephemeral: true,
        });
        return true;
      }

      await pool.execute(
        `UPDATE afwezigheden
         SET start_at = ?, end_at = ?, reason = ?, reminder_sent = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [startAt, endAt, reden, row.id]
      );

      await sendLog(
        config.AFWEZIGHEID_SETTINGS?.LOG_CHANNEL_ID,
        createLogEmbed({
          title: '✦ Afwezigheid aangepast',
          description: `${interaction.user.tag} heeft een afwezigheid aangepast.`,
          fields: [
            { name: 'Type', value: getTypeLabel(row.type), inline: true },
            { name: 'Van', value: formatDutchDateTimeDisplay(startAt), inline: true },
            { name: 'Tot', value: formatDutchDateTimeDisplay(endAt), inline: true },
            { name: 'Reden', value: reden.slice(0, 1024), inline: false },
          ],
        })
      );

      await refreshAfwezigheidPublicPanel(interaction.guild, 'Afwezigheid aangepast');
      await refreshAfwezigheidOverviewPanel(interaction.guild, 'Afwezigheid aangepast');

      await interaction.reply({
        embeds: [createBaseEmbed({ title: 'Afwezigheid aangepast', description: 'Jouw afwezigheid is bijgewerkt.' })],
        ephemeral: true,
      });

      return true;
    }

    if (modalType === 'afwezigheid_extend_modal') {
      const endAt = parseDutchDateTime(interaction.fields.getTextInputValue('tot'));

      if (!endAt) {
        await interaction.reply({
          embeds: [createBaseEmbed({ title: 'Ongeldige datum', description: 'Controleer de nieuwe einddatum.' })],
          ephemeral: true,
        });
        return true;
      }

      if (endAt <= new Date(row.end_at)) {
        await interaction.reply({
          embeds: [createBaseEmbed({ title: 'Ongeldige verlenging', description: 'De nieuwe einddatum moet later zijn dan de huidige einddatum.' })],
          ephemeral: true,
        });
        return true;
      }

      await pool.execute(
        `UPDATE afwezigheden
         SET end_at = ?, reminder_sent = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [endAt, row.id]
      );

      await sendLog(
        config.AFWEZIGHEID_SETTINGS?.LOG_CHANNEL_ID,
        createLogEmbed({
          title: '✦ Afwezigheid verlengd',
          description: `${interaction.user.tag} heeft een afwezigheid verlengd.`,
          fields: [
            { name: 'Type', value: getTypeLabel(row.type), inline: true },
            { name: 'Nieuwe einddatum', value: formatDutchDateTimeDisplay(endAt), inline: true },
          ],
        })
      );

      await refreshAfwezigheidPublicPanel(interaction.guild, 'Afwezigheid verlengd');
      await refreshAfwezigheidOverviewPanel(interaction.guild, 'Afwezigheid verlengd');

      await interaction.reply({
        embeds: [createBaseEmbed({ title: 'Afwezigheid verlengd', description: 'Jouw afwezigheid is verlengd.' })],
        ephemeral: true,
      });

      return true;
    }

    return false;
  },
};
