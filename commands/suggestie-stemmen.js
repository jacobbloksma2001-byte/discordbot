const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

function getGangRoleIds(config) {
  if (Array.isArray(config.GANG_ROLE_IDS) && config.GANG_ROLE_IDS.length > 0) {
    return config.GANG_ROLE_IDS;
  }

  return Array.isArray(config.PROMOTABLE_RANKS)
    ? config.PROMOTABLE_RANKS.map(rank => rank.value)
    : [];
}

function isGangMember(member, config) {
  if (!member) return false;

  const gangRoleIds = getGangRoleIds(config);
  if (gangRoleIds.length === 0) return false;

  return gangRoleIds.some(roleId => member.roles.cache.has(roleId));
}

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

async function getVoteTotals(pool, suggestionId, guildId) {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
       COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) AS downvotes
     FROM suggestion_votes
     WHERE suggestion_id = ? AND guild_id = ?`,
    [suggestionId, guildId]
  );

  return {
    upvotes: Number(rows[0]?.upvotes || 0),
    downvotes: Number(rows[0]?.downvotes || 0)
  };
}

async function refreshSuggestionMessage({
  pool,
  suggestionId,
  guildId,
  createBaseEmbed,
  fetchTextChannel
}) {
  const [rows] = await pool.execute(
    `SELECT id, user_id, channel_id, message_id, suggestion, status
     FROM community_suggestions
     WHERE id = ? AND guild_id = ?
     LIMIT 1`,
    [suggestionId, guildId]
  );

  if (!rows.length) return false;

  const suggestion = rows[0];
  const { upvotes, downvotes } = await getVoteTotals(pool, suggestionId, guildId);

  const channel = await fetchTextChannel(suggestion.channel_id);
  if (!channel) return false;

  const message = await channel.messages.fetch(suggestion.message_id).catch(() => null);
  if (!message) return false;

  const statusLabel =
    suggestion.status === 'accepted'
      ? 'Geaccepteerd'
      : suggestion.status === 'denied'
      ? 'Afgewezen'
      : 'Open';

  const submitterText = suggestion.user_id ? `<@${suggestion.user_id}>` : 'Onbekend';

  const embed = createBaseEmbed({
    title: `Suggestie #${suggestion.id}`,
    description: suggestion.suggestion,
    fields: [
      { name: 'Ingediend door', value: submitterText, inline: true },
      { name: 'Status', value: statusLabel, inline: true },
      { name: 'Stemmen', value: `👍 ${upvotes} | 👎 ${downvotes}`, inline: false }
    ]
  });

  await message.edit({
    embeds: [embed],
    components: [buildSuggestionButtons(suggestion.id, upvotes, downvotes)]
  });

  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestie-stemmen')
    .setDescription('Interne handler voor suggestiestemmen'),

  async execute(interaction) {
    await interaction.reply({
      content: 'Deze command is alleen intern voor stemknoppen.',
      ephemeral: true
    });
    return true;
  },

  async handleButton(interaction, {
    config,
    pool,
    createBaseEmbed,
    fetchTextChannel,
    sendBotLog
  }) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith('suggestie_vote:')) return false;

    if (!interaction.guild) {
      await interaction.reply({
        content: 'Deze knop werkt alleen in een server.',
        ephemeral: true
      });
      return true;
    }

    if (!isGangMember(interaction.member, config)) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Geen toegang',
            description: 'Alleen gangleden mogen stemmen op suggesties.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const [, suggestionIdRaw, voteRaw] = interaction.customId.split(':');
    const suggestionId = Number(suggestionIdRaw);
    const vote = Number(voteRaw);

    if (!Number.isInteger(suggestionId) || ![1, -1].includes(vote)) {
      await interaction.reply({
        content: 'Ongeldige stemknop.',
        ephemeral: true
      });
      return true;
    }

    const [suggestionRows] = await pool.execute(
      `SELECT id, guild_id, status
       FROM community_suggestions
       WHERE id = ? AND guild_id = ?
       LIMIT 1`,
      [suggestionId, interaction.guild.id]
    );

    if (!suggestionRows.length) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Niet gevonden',
            description: 'Deze suggestie bestaat niet meer of hoort niet bij deze server.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const suggestion = suggestionRows[0];

    if (suggestion.status !== 'open') {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Stemmen gesloten',
            description: 'Op deze suggestie kan niet meer gestemd worden.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    await pool.execute(
      `INSERT INTO suggestion_votes (suggestion_id, guild_id, user_id, vote)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE vote = VALUES(vote), updated_at = CURRENT_TIMESTAMP`,
      [suggestionId, interaction.guild.id, interaction.user.id, vote]
    );

    await refreshSuggestionMessage({
      pool,
      suggestionId,
      guildId: interaction.guild.id,
      createBaseEmbed,
      fetchTextChannel
    });

    const { upvotes, downvotes } = await getVoteTotals(pool, suggestionId, interaction.guild.id);

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: 'Stem opgeslagen',
          description: `Je stem is verwerkt voor suggestie #${suggestionId}.`,
          fields: [
            { name: 'Jouw stem', value: vote === 1 ? '👍 Upvote' : '👎 Downvote', inline: true },
            { name: 'Totaal', value: `👍 ${upvotes} | 👎 ${downvotes}`, inline: true }
          ]
        })
      ],
      ephemeral: true
    });

    await sendBotLog(
      '✦ Suggestie stem uitgebracht',
      `**${interaction.user.tag}** heeft gestemd op suggestie **#${suggestionId}**.`,
      [
        { name: 'Stem', value: vote === 1 ? 'Upvote' : 'Downvote', inline: true },
        { name: 'Guild', value: interaction.guild.name, inline: true },
        { name: 'Totaal', value: `👍 ${upvotes} | 👎 ${downvotes}`, inline: false }
      ]
    );

    return true;
  }
};