const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Geeft een strike aan een lid.')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker die een strike ontvangt.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reden')
        .setDescription('De reden van de strike.')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction, context) {
    const { config, createBaseEmbed, fetchTextChannel, sendBotLog } = context;

    const targetUser = interaction.options.getUser('gebruiker', true);
    const reason = interaction.options.getString('reden', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({
        content: 'Deze command kan alleen in een server gebruikt worden.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        await interaction.editReply({
          content: 'Die gebruiker zit niet in deze server.',
        });
        return;
      }

      if (member.user.bot) {
        await interaction.editReply({
          content: 'Je kunt geen strike geven aan een bot.',
        });
        return;
      }

      if (member.id === interaction.user.id) {
        await interaction.editReply({
          content: 'Je kunt jezelf geen strike geven.',
        });
        return;
      }

      const strikeRoleId = config.STRIKE_ROLE_ID;
      const keepRoleId = config.STRIKE_KEEP_ROLE_ID;
      const strikeChannelId = config.STRIKE_CHANNEL_ID;

      if (!strikeRoleId || !keepRoleId || !strikeChannelId) {
        await interaction.editReply({
          content: 'STRIKE_ROLE_ID, STRIKE_KEEP_ROLE_ID of STRIKE_CHANNEL_ID ontbreekt in config.js.',
        });
        return;
      }

      const strikeRole = await guild.roles.fetch(strikeRoleId).catch(() => null);
      const keepRole = await guild.roles.fetch(keepRoleId).catch(() => null);

      if (!strikeRole) {
        await interaction.editReply({
          content: 'De strikerol kon niet worden gevonden.',
        });
        return;
      }

      if (!keepRole) {
        await interaction.editReply({
          content: 'De rol die behouden moet blijven kon niet worden gevonden.',
        });
        return;
      }

      const botMember = guild.members.me;
      if (!botMember) {
        await interaction.editReply({
          content: 'De bot kon niet correct worden geladen in deze server.',
        });
        return;
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.editReply({
          content: 'De bot heeft geen rechten om rollen te beheren.',
        });
        return;
      }

      if (strikeRole.position >= botMember.roles.highest.position) {
        await interaction.editReply({
          content: 'De strikerol staat hoger dan de bot en kan daarom niet worden toegewezen.',
        });
        return;
      }

      if (keepRole.position >= botMember.roles.highest.position) {
        await interaction.editReply({
          content: 'De bewaarroll staat hoger dan de bot en kan daarom niet goed beheerd worden.',
        });
        return;
      }

      if (member.roles.highest.position >= botMember.roles.highest.position) {
        await interaction.editReply({
          content: 'Ik kan deze gebruiker niet aanpassen omdat zijn hoogste rol hoger of gelijk is aan die van de bot.',
        });
        return;
      }

      if (
        interaction.member &&
        'roles' in interaction.member &&
        member.roles.highest.position >= interaction.member.roles.highest.position
      ) {
        await interaction.editReply({
          content: 'Je kunt geen strike geven aan iemand met een gelijke of hogere rol dan jij.',
        });
        return;
      }

      const rolesToKeep = new Set([
        guild.id,
        keepRoleId,
        strikeRoleId,
      ]);

      const rolesToRemove = member.roles.cache
        .filter(role => !rolesToKeep.has(role.id))
        .filter(role => role.position < botMember.roles.highest.position)
        .map(role => role.id);

      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove, `Strike ontvangen van ${interaction.user.tag}: ${reason}`);
      }

      if (!member.roles.cache.has(strikeRoleId)) {
        await member.roles.add(strikeRoleId, `Strike ontvangen van ${interaction.user.tag}: ${reason}`);
      }

      if (!member.roles.cache.has(keepRoleId)) {
        await member.roles.add(keepRoleId, `Bewaarrol behouden bij strike voor ${member.user.tag}`);
      }

      const strikeChannel = await fetchTextChannel(strikeChannelId);
      if (!strikeChannel) {
        await interaction.editReply({
          content: 'De strike is uitgevoerd, maar het strikekanaal kon niet worden gevonden.',
        });

        await sendBotLog(
          '✦ 𝑺𝒕𝒓𝒊𝒌𝒆 𝒌𝒂𝒏𝒂𝒂𝒍 𝒇𝒐𝒖𝒕',
          'Een strike is uitgevoerd, maar het strikekanaal kon niet worden gevonden.',
          [
            { name: 'Ontvanger', value: `${member.user.tag} (${member.id})`, inline: false },
            { name: 'Uitgedeeld door', value: `${interaction.user.tag}`, inline: false },
            { name: 'Reden', value: reason.slice(0, 1024), inline: false },
          ]
        );
        return;
      }

      const strikeEmbed = createBaseEmbed({
        title: '✦ Strike uitgedeeld ✦',
        description: `${member} heeft een strike ontvangen.`,
        thumbnail: member.user.displayAvatarURL({ forceStatic: false }),
        fields: [
          {
            name: 'Gebruiker',
            value: `${member.user.tag}\n<@${member.id}>`,
            inline: true,
          },
          {
            name: 'Uitgedeeld door',
            value: `${interaction.user.tag}\n<@${interaction.user.id}>`,
            inline: true,
          },
          {
            name: 'Wanneer',
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: false,
          },
          {
            name: 'Reden',
            value: reason.slice(0, 1024),
            inline: false,
          },
        ],
        image: true,
      });

      await strikeChannel.send({ embeds: [strikeEmbed] });

      await interaction.editReply({
        content: `${member.user.tag} heeft succesvol een strike ontvangen.`,
      });

      await sendBotLog(
        '✦ 𝑺𝒕𝒓𝒊𝒌𝒆 𝒖𝒊𝒕𝒈𝒆𝒅𝒆𝒆𝒍𝒅',
        `${member.user.tag} heeft een strike ontvangen.`,
        [
          { name: 'Uitgedeeld door', value: interaction.user.tag, inline: true },
          { name: 'Gebruiker', value: member.user.tag, inline: true },
          { name: 'Reden', value: reason.slice(0, 1024), inline: false },
        ]
      );
    } catch (error) {
      console.error('Fout bij /strike:', error);

      await interaction.editReply({
        content: 'Er ging iets mis bij het uitdelen van de strike.',
      }).catch(() => null);

      await sendBotLog(
        '✦ 𝑺𝒕𝒓𝒊𝒌𝒆 𝒇𝒐𝒖𝒕',
        'Er ging iets mis bij het uitvoeren van de /strike command.',
        [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
      );
    }
  },
};