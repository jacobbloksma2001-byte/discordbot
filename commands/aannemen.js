const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aannemen')
    .setDescription('Neem een gebruiker officieel aan bij Vyrkazoz')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker die je wilt aannemen')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    const {
      config,
      createBaseEmbed,
      fetchTextChannel,
      sendBotLog,
      queueMemberListUpdate,
      pool
    } = ctx;

    const user = interaction.options.getUser('gebruiker', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        content: 'Deze gebruiker zit niet in de server.',
        ephemeral: true
      });
    }

    const starterRole1 = await interaction.guild.roles.fetch(config.STARTER_ROLE_1_ID).catch(() => null);
    const starterRole2 = await interaction.guild.roles.fetch(config.STARTER_ROLE_2_ID).catch(() => null);

    if (!starterRole1 || !starterRole2) {
      return interaction.reply({
        content: 'Eén of beide starterrangen konden niet worden gevonden.',
        ephemeral: true
      });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: 'De bot mist de permissie Manage Roles.',
        ephemeral: true
      });
    }

    if (
      starterRole1.position >= botMember.roles.highest.position ||
      starterRole2.position >= botMember.roles.highest.position
    ) {
      return interaction.reply({
        content: 'Eén of beide starterrangen staan te hoog in de rolhiërarchie.',
        ephemeral: true
      });
    }

    try {
      await member.roles.add([starterRole1.id, starterRole2.id], `Aangenomen door ${interaction.user.tag}`);

      const dmEmbed = createBaseEmbed({
        title: '✦ 𝑱𝒆 𝒃𝒆𝒏𝒕 𝒂𝒂𝒏𝒈𝒆𝒏𝒐𝒎𝒆𝒏 ✦',
        description:
          `Hey ${member},\n\n` +
          `Jij bent officieel aangenomen bij **${config.SERVER_NAME}**.\n\n` +
          `Welkom bij **Vyrkazoz**. Binnenkort ontvang je meer informatie.`
      });

      await user.send({ embeds: [dmEmbed] }).catch(() => null);

      const hiredChannel = await fetchTextChannel(config.HIRED_LOG_CHANNEL_ID);

      if (hiredChannel) {
        const hiredEmbed = createBaseEmbed({
          title: '✦ 𝑵𝒊𝒆𝒖𝒘𝒆 𝑨𝒂𝒏𝒏𝒂𝒎𝒆 ✦',
          description: `${member} is officieel aangenomen bij **Vyrkazoz**. Welkom!`,
          thumbnail: user.displayAvatarURL({ forceStatic: false }),
          fields: [
            {
              name: 'Aangenomen door',
              value: `${interaction.user}`,
              inline: true
            },
            {
              name: 'Gebruiker',
              value: `${member}`,
              inline: true
            },
            {
              name: 'Datum en tijd',
              value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
              inline: false
            }
          ]
        });

        await hiredChannel.send({ embeds: [hiredEmbed] });
      }

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
          starterRole1.id,
          starterRole1.name,
          member.user.bot ? 1 : 0
        ]
      );

      queueMemberListUpdate(interaction.guild, `Aanneming van ${member.user.tag}`, 1000);

      await sendBotLog(
        '✦ 𝑨𝒂𝒏𝒏𝒂𝒎𝒆 𝒗𝒐𝒍𝒕𝒐𝒐𝒊𝒅',
        `${member.user.tag} is aangenomen door ${interaction.user.tag}.`,
        [
          { name: 'Gebruiker', value: `${member.user.tag} (${member.id})`, inline: false },
          { name: 'Aangenomen door', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
          { name: 'Starterrollen', value: `${starterRole1.name}\n${starterRole2.name}`, inline: false }
        ]
      );

      return interaction.reply({
        content: `${member.user.tag} is succesvol aangenomen.`,
        ephemeral: true
      });
    } catch (error) {
      console.error(error);

      await sendBotLog(
        '✦ 𝑨𝒂𝒏𝒏𝒂𝒎𝒆 𝒇𝒐𝒖𝒕',
        `Aannemen van ${member.user.tag} is mislukt.`,
        [
          { name: 'Fout', value: error.message.slice(0, 1024), inline: false }
        ]
      );

      return interaction.reply({
        content: 'Er ging iets mis bij het aannemen van deze gebruiker.',
        ephemeral: true
      });
    }
  }
};