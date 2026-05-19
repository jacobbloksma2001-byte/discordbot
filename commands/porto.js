const {
  SlashCommandBuilder,
  PermissionsBitField
} = require('discord.js');

function hasStaffPerms(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

function generatePortoNumber() {
  return Math.floor(Math.random() * (9999 - 600 + 1)) + 600;
}

async function deactivateCurrentPorto(pool, guildId) {
  await pool.execute(
    `UPDATE gang_porto_codes
     SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
     WHERE guild_id = ? AND is_active = 1`,
    [guildId]
  );
}

async function getLastPorto(pool, guildId) {
  const [rows] = await pool.execute(
    `SELECT porto_number
     FROM gang_porto_codes
     WHERE guild_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [guildId]
  );

  return rows[0] || null;
}

async function createNewPorto(pool, guildId, user) {
  let portoNumber = generatePortoNumber();
  const lastPorto = await getLastPorto(pool, guildId);

  if (lastPorto && Number(lastPorto.porto_number) === portoNumber) {
    let attempts = 0;
    while (portoNumber === Number(lastPorto.porto_number) && attempts < 25) {
      portoNumber = generatePortoNumber();
      attempts++;
    }
  }

  await deactivateCurrentPorto(pool, guildId);

  await pool.execute(
    `INSERT INTO gang_porto_codes
     (guild_id, porto_number, created_by_user_id, created_by_username, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [guildId, portoNumber, user.id, user.tag]
  );

  return portoNumber;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('porto')
    .setDescription('Genereert een nieuwe porto-code voor de hele gang'),

  async execute(interaction, {
    config,
    pool,
    createBaseEmbed,
    sendBotLog,
    fetchTextChannel
  }) {
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

    if (!config.PORTO_CHANNEL_ID) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Kanaal niet ingesteld',
            description: 'PORTO_CHANNEL_ID staat niet ingesteld in config.js.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const portoChannel = await fetchTextChannel(config.PORTO_CHANNEL_ID);

    if (!portoChannel) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Kanaal niet gevonden',
            description: 'Het porto kanaal kon niet worden gevonden of is niet tekstgebaseerd.'
          })
        ],
        ephemeral: true
      });

      await sendBotLog(
        '✦ 𝑷𝒐𝒓𝒕𝒐 𝒌𝒂𝒏𝒂𝒂𝒍 𝒇𝒐𝒖𝒕',
        'Het porto kanaal kon niet worden gevonden of is niet tekstgebaseerd.'
      );

      return true;
    }

    try {
      const botMember = interaction.guild.members.me;

      if (!botMember.permissions.has(PermissionsBitField.Flags.SendMessages)) {
        await interaction.reply({
          content: 'Ik mis de permissie Send Messages.',
          ephemeral: true
        });
        return true;
      }

      const channelPerms = portoChannel.permissionsFor(botMember);

      if (!channelPerms?.has(PermissionsBitField.Flags.SendMessages)) {
        await interaction.reply({
          content: 'Ik kan niet spreken in het porto kanaal.',
          ephemeral: true
        });
        return true;
      }

      if (!channelPerms?.has(PermissionsBitField.Flags.EmbedLinks)) {
        await interaction.reply({
          content: 'Ik mis de permissie Embed Links in het porto kanaal.',
          ephemeral: true
        });
        return true;
      }

      const portoNumber = await createNewPorto(pool, interaction.guild.id, interaction.user);

      const portoEmbed = createBaseEmbed({
        title: '✦ 𝑵𝒊𝒆𝒖𝒘𝒆 𝑷𝒐𝒓𝒕𝒐 𝑪𝒐𝒅𝒆 ✦',
        description: 'Er is een nieuwe porto-code ingesteld voor de hele gang.',
        fields: [
          { name: 'Actieve porto-code', value: `**${portoNumber}**`, inline: true },
          { name: 'Ingesteld door', value: `${interaction.user}`, inline: true },
          { name: 'Server', value: config.SERVER_NAME, inline: true }
        ]
      });

      await portoChannel.send({
        content: '@everyone',
        allowedMentions: { parse: ['everyone'] },
        embeds: [portoEmbed]
      });

      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Porto-code verstuurd',
            description: `De nieuwe porto-code **${portoNumber}** is verstuurd in ${portoChannel}.`
          })
        ],
        ephemeral: true
      });

      return true;
    } catch (error) {
      console.error(error);

      await sendBotLog(
        '✦ 𝑷𝒐𝒓𝒕𝒐 𝒇𝒐𝒖𝒕',
        `Er ging iets mis bij het aanmaken van een nieuwe porto-code in **${interaction.guild.name}**.`,
        [
          { name: 'Fout', value: error.message.slice(0, 1024), inline: false }
        ]
      );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Er ging iets mis: ${error.message}`,
          ephemeral: true
        }).catch(() => null);
      } else {
        await interaction.reply({
          content: `Er ging iets mis: ${error.message}`,
          ephemeral: true
        }).catch(() => null);
      }

      return true;
    }
  }
};