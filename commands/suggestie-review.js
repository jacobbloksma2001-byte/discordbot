const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require('discord.js');

function hasStaffPerms(member) {
  if (!member) return false;
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestie-review')
    .setDescription('Beoordeel een ingestuurde suggestie')
    .addIntegerOption(option =>
      option
        .setName('id')
        .setDescription('ID van de suggestie')
        .setRequired(true)
    ),

  async execute(interaction, { pool, createBaseEmbed }) {
    if (!hasStaffPerms(interaction.member)) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Geen toegang',
            description: 'Je hebt geen rechten om deze command te gebruiken.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const suggestionId = interaction.options.getInteger('id');

    const [rows] = await pool.execute(
      `SELECT id, guild_id, user_id, suggestion, status
       FROM community_suggestions
       WHERE id = ? AND guild_id = ?
       LIMIT 1`,
      [suggestionId, interaction.guild.id]
    );

    if (!rows.length) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Niet gevonden',
            description: 'Deze suggestie bestaat niet of hoort niet bij deze server.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const suggestion = rows[0];

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`suggestie_review_select:${suggestion.id}`)
        .setPlaceholder('Kies een beoordeling')
        .addOptions([
          { label: 'Goedkeuren', value: 'approved' },
          { label: 'Afwijzen', value: 'rejected' },
          { label: 'In behandeling', value: 'pending' }
        ])
    );

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: `Suggestie #${suggestion.id}`,
          description: suggestion.suggestion,
          fields: [
            { name: 'Status', value: suggestion.status, inline: true },
            { name: 'Indiener', value: `<@${suggestion.user_id}>`, inline: true }
          ]
        })
      ],
      components: [menu],
      ephemeral: true
    });

    return true;
  },

  async handleComponent(interaction, { pool, createBaseEmbed, fetchTextChannel, config }) {
    if (!interaction.isStringSelectMenu()) return false;
    if (!interaction.customId.startsWith('suggestie_review_select:')) return false;

    if (!hasStaffPerms(interaction.member)) {
      await interaction.reply({ content: 'Je hebt hier geen rechten voor.', ephemeral: true });
      return true;
    }

    const suggestionId = Number(interaction.customId.split(':')[1]);
    const status = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`suggestie_review_modal:${suggestionId}:${status}`)
      .setTitle('Opmerking bij review');

    const input = new TextInputBuilder()
      .setCustomId('review_note')
      .setLabel('Opmerking')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000)
      .setPlaceholder('Optioneel: waarom deze keuze?');

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return true;
  },

  async handleModal(interaction, { pool, createBaseEmbed, fetchTextChannel, config }) {
    if (!interaction.isModalSubmit()) return false;
    if (!interaction.customId.startsWith('suggestie_review_modal:')) return false;

    if (!hasStaffPerms(interaction.member)) {
      await interaction.reply({ content: 'Je hebt hier geen rechten voor.', ephemeral: true });
      return true;
    }

    const [, idPart, status] = interaction.customId.split(':');
    const suggestionId = Number(idPart);
    const reviewNote = (interaction.fields.getTextInputValue('review_note') || '').trim();

    const [rows] = await pool.execute(
      `SELECT id, guild_id, user_id, suggestion
       FROM community_suggestions
       WHERE id = ? AND guild_id = ?
       LIMIT 1`,
      [suggestionId, interaction.guild.id]
    );

    if (!rows.length) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Niet gevonden',
            description: 'De suggestie kon niet meer worden gevonden.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const suggestion = rows[0];

    await pool.execute(
      `UPDATE community_suggestions
       SET status = ?, reviewed_by = ?, review_note = ?
       WHERE id = ? AND guild_id = ?`,
      [status, interaction.user.id, reviewNote || null, suggestionId, interaction.guild.id]
    );

    const statusLabel =
      status === 'approved' ? 'Goedgekeurd' :
      status === 'rejected' ? 'Afgewezen' :
      'In behandeling';

    const resultEmbed = createBaseEmbed({
      title: `Suggestie #${suggestion.id} bijgewerkt`,
      description: suggestion.suggestion,
      fields: [
        { name: 'Nieuwe status', value: statusLabel, inline: true },
        { name: 'Beoordeeld door', value: `${interaction.user}`, inline: true },
        { name: 'Opmerking', value: reviewNote || 'Geen opmerking', inline: false }
      ]
    });

    const logChannel = config.SUGGESTION_LOG_CHANNEL_ID
      ? await fetchTextChannel(config.SUGGESTION_LOG_CHANNEL_ID)
      : null;

    if (logChannel) {
      await logChannel.send({ embeds: [resultEmbed] });
    }

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: 'Review opgeslagen',
          description: `Suggestie #${suggestion.id} is bijgewerkt naar **${statusLabel}**.`
        })
      ],
      ephemeral: true
    });

    return true;
  }
};