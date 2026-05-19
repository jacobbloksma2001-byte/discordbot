const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

function buildSuggestionButtons(suggestionId, upvotes = 0, downvotes = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggestie_vote:${suggestionId}:1`)
      .setLabel(`👍 ${upvotes}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`suggestie_vote:${suggestionId}:-1`)
      .setLabel(`👎 ${downvotes}`)
      .setStyle(ButtonStyle.Danger)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestie')
    .setDescription('Stuur een suggestie in'),

  async execute(interaction, { config, createBaseEmbed }) {
    if (!interaction.guild) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Niet toegestaan',
            description: 'Deze command werkt alleen in een server.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    if (!config.SUGGESTION_CHANNEL_ID) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Niet ingesteld',
            description: 'SUGGESTION_CHANNEL_ID staat niet in je config.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId('suggestie_modal')
      .setTitle('Nieuwe suggestie');

    const input = new TextInputBuilder()
      .setCustomId('suggestie_text')
      .setLabel('Wat is je suggestie?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1000)
      .setPlaceholder('Beschrijf je idee duidelijk en kort');

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return true;
  },

  async handleModal(interaction, {
    config,
    pool,
    createBaseEmbed,
    fetchTextChannel,
    sendBotLog
  }) {
    if (!interaction.isModalSubmit()) return false;
    if (interaction.customId !== 'suggestie_modal') return false;

    const suggestionText = interaction.fields.getTextInputValue('suggestie_text').trim();
    const channel = await fetchTextChannel(config.SUGGESTION_CHANNEL_ID);

    if (!channel) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Kanaal niet gevonden',
            description: 'Het suggestiekanaal kon niet worden gevonden.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const [insertResult] = await pool.execute(
      `INSERT INTO community_suggestions (guild_id, user_id, channel_id, suggestion)
       VALUES (?, ?, ?, ?)`,
      [interaction.guild.id, interaction.user.id, channel.id, suggestionText]
    );

    const suggestionId = insertResult.insertId;

    const embed = createBaseEmbed({
      title: `Suggestie #${suggestionId}`,
      description: suggestionText,
      thumbnail: interaction.user.displayAvatarURL({ forceStatic: false }),
      fields: [
        { name: 'Ingediend door', value: `${interaction.user}`, inline: true },
        { name: 'Status', value: 'Open', inline: true },
        { name: 'Stemmen', value: '👍 0 | 👎 0', inline: false }
      ]
    });

    const message = await channel.send({
      embeds: [embed],
      components: [buildSuggestionButtons(suggestionId, 0, 0)]
    });

    await pool.execute(
      `UPDATE community_suggestions
       SET message_id = ?
       WHERE id = ? AND guild_id = ?`,
      [message.id, suggestionId, interaction.guild.id]
    );

    if (config.SUGGESTION_LOG_CHANNEL_ID) {
      const logChannel = await fetchTextChannel(config.SUGGESTION_LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          embeds: [
            createBaseEmbed({
              title: 'Nieuwe suggestie geplaatst',
              description: `Suggestie #${suggestionId} is aangemaakt.`,
              fields: [
                { name: 'Gebruiker', value: `${interaction.user}`, inline: true },
                { name: 'Kanaal', value: `${channel}`, inline: true },
                { name: 'Tekst', value: suggestionText.slice(0, 1024), inline: false }
              ]
            })
          ]
        });
      }
    }

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: 'Suggestie verstuurd',
          description: `Je suggestie is geplaatst in ${channel}.`
        })
      ],
      ephemeral: true
    });

    await sendBotLog(
      '✦ Suggestie aangemaakt',
      `**${interaction.user.tag}** heeft suggestie #${suggestionId} aangemaakt.`,
      [
        { name: 'Suggestie ID', value: String(suggestionId), inline: true },
        { name: 'Guild', value: interaction.guild.name, inline: true }
      ]
    );

    return true;
  }
};