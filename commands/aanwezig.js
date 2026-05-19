const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

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

  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

async function cleanupAfwezigState(guild, row, config) {
  const member = await guild.members.fetch(row.user_id).catch(() => null);
  if (!member) return;

  const botMember = guild.members.me;
  if (!botMember) return;

  const roleId = config.AFWEZIGHEID_SETTINGS?.AFWEZIG_ROLE_ID;

  if (roleId && botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (role && role.position < botMember.roles.highest.position && member.roles.cache.has(role.id)) {
      await member.roles.remove(role.id, 'Handmatig weer aanwezig gemeld').catch(() => null);
    }
  }

  if (botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
    const originalName = row.original_display_name || null;
    await member.setNickname(originalName, 'Handmatig weer aanwezig gemeld').catch(() => null);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aanwezig')
    .setDescription('Meld jezelf weer aanwezig.'),

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

    const [rows] = await pool.execute(
      `SELECT *
       FROM afwezigheden
       WHERE guild_id = ? AND user_id = ? AND status IN ('planned', 'active')
       ORDER BY created_at DESC
       LIMIT 1`,
      [interaction.guild.id, interaction.user.id]
    );

    const row = rows[0] || null;

    if (!row) {
      await interaction.reply({
        embeds: [createBaseEmbed({ title: 'Geen afwezigheid gevonden', description: 'Je hebt momenteel geen actieve of geplande afwezigheid.' })],
        ephemeral: true,
      });
      return true;
    }

    await cleanupAfwezigState(interaction.guild, row, config);

    await pool.execute(
      `UPDATE afwezigheden
       SET status = 'ended', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [row.id]
    );

    await sendLog(
      config.AFWEZIGHEID_SETTINGS?.LOG_CHANNEL_ID,
      createLogEmbed({
        title: '✦ Weer aanwezig gemeld',
        description: `${interaction.user.tag} heeft zichzelf weer aanwezig gemeld.`,
        fields: [
          { name: 'Type', value: getTypeLabel(row.type), inline: true },
          { name: 'Van', value: formatDutchDateTime(row.start_at), inline: true },
          { name: 'Tot', value: formatDutchDateTime(row.end_at), inline: true },
        ],
      })
    );

    await refreshAfwezigheidPublicPanel(interaction.guild, 'Handmatig aanwezig gemeld');
    await refreshAfwezigheidOverviewPanel(interaction.guild, 'Handmatig aanwezig gemeld');

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: 'Weer aanwezig gemeld',
          description: 'Jouw afwezigheid is beëindigd.',
        }),
      ],
      ephemeral: true,
    });

    return true;
  },
};
