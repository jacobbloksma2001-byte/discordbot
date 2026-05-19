const { SlashCommandBuilder } = require('discord.js');

function hasStaffRole(member, config) {
  if (!member || !member.roles?.cache) return false;
  return Array.isArray(config.RANK_ROLES) && config.RANK_ROLES.some(rank => member.roles.cache.has(rank.id));
}

function getTypeChoices() {
  return [
    { name: 'Persoonlijk', value: 'persoonlijk' },
    { name: 'Vakantie', value: 'vakantie' },
    { name: 'Familie omstandigheden', value: 'familie' },
    { name: 'Werk', value: 'werk' },
    { name: 'School', value: 'school' },
  ];
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

function formatDutchDateTime(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return 'Ongeldige datum';

  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afwezigheid')
    .setDescription('Meld jezelf afwezig.')
    .addStringOption(option =>
      option.setName('type').setDescription('Soort afwezigheid').setRequired(true).addChoices(...getTypeChoices())
    )
    .addStringOption(option =>
      option.setName('van').setDescription('Begindatum, bijvoorbeeld 16-05-2026 09:00').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('tot').setDescription('Einddatum, bijvoorbeeld 20-05-2026 22:00').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reden').setDescription('Waarom ben je afwezig?').setRequired(true)
    ),

  async execute(interaction, {
    config,
    pool,
    createBaseEmbed,
    createLogEmbed,
    sendLog,
    refreshAfwezigheidPublicPanel,
    refreshAfwezigheidOverviewPanel,
  }) {
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

    const type = interaction.options.getString('type', true);
    const vanInput = interaction.options.getString('van', true);
    const totInput = interaction.options.getString('tot', true);
    const reden = interaction.options.getString('reden', true).trim();

    const startAt = parseDutchDateTime(vanInput);
    const endAt = parseDutchDateTime(totInput);

    if (!startAt || !endAt) {
      await interaction.reply({
        embeds: [createBaseEmbed({
          title: 'Ongeldige datum',
          description: 'Gebruik formaat `dd-mm-jjjj uu:mm`, bijvoorbeeld `16-05-2026 09:00`.',
        })],
        ephemeral: true,
      });
      return true;
    }

    if (endAt <= startAt) {
      await interaction.reply({
        embeds: [createBaseEmbed({
          title: 'Ongeldige periode',
          description: 'De einddatum moet later zijn dan de begindatum.',
        })],
        ephemeral: true,
      });
      return true;
    }

    const [existingRows] = await pool.execute(
      `SELECT id
       FROM afwezigheden
       WHERE guild_id = ? AND user_id = ? AND status IN ('planned', 'active')
       LIMIT 1`,
      [interaction.guild.id, interaction.user.id]
    );

    if (existingRows.length > 0) {
      await interaction.reply({
        embeds: [createBaseEmbed({
          title: 'Afwezigheid bestaat al',
          description: 'Je hebt al een actieve of geplande afwezigheid. Gebruik `/mijnafwezigheid` om deze te beheren.',
        })],
        ephemeral: true,
      });
      return true;
    }

    const now = new Date();
    const status = startAt <= now ? 'active' : 'planned';
    const originalDisplayName = interaction.member.displayName || interaction.user.username;

    const [result] = await pool.execute(
      `INSERT INTO afwezigheden
       (guild_id, user_id, username, original_display_name, current_display_name, type, reason, start_at, end_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        interaction.guild.id,
        interaction.user.id,
        interaction.user.tag,
        originalDisplayName,
        originalDisplayName,
        type,
        reden,
        startAt,
        endAt,
        status,
      ]
    );

    const afwezigheidId = result.insertId;

    await sendLog(
      config.AFWEZIGHEID_SETTINGS?.LOG_CHANNEL_ID,
      createLogEmbed({
        title: '✦ Afwezigheid aangemaakt',
        description: `${interaction.user.tag} heeft een afwezigheid aangemaakt.`,
        fields: [
          { name: 'ID', value: String(afwezigheidId), inline: true },
          { name: 'Type', value: getTypeLabel(type), inline: true },
          { name: 'Status', value: status === 'active' ? 'Actief' : 'Gepland', inline: true },
          { name: 'Van', value: formatDutchDateTime(startAt), inline: true },
          { name: 'Tot', value: formatDutchDateTime(endAt), inline: true },
          { name: 'Reden', value: reden.slice(0, 1024), inline: false },
        ],
      })
    );

    await refreshAfwezigheidPublicPanel(interaction.guild, 'Nieuwe afwezigheid aangemaakt');
    await refreshAfwezigheidOverviewPanel(interaction.guild, 'Nieuwe afwezigheid aangemaakt');

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: 'Afwezigheid aangemaakt',
          description: 'Jouw afwezigheid is succesvol opgeslagen.',
          thumbnail: interaction.user.displayAvatarURL({ forceStatic: false }),
          fields: [
            { name: 'Type', value: getTypeLabel(type), inline: true },
            { name: 'Status', value: status === 'active' ? 'Actief' : 'Gepland', inline: true },
            { name: 'Van', value: formatDutchDateTime(startAt), inline: true },
            { name: 'Tot', value: formatDutchDateTime(endAt), inline: true },
            { name: 'Reden', value: reden.slice(0, 1024), inline: false },
          ],
        }),
      ],
      ephemeral: true,
    });

    return true;
  },
};
