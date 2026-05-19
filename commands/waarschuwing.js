const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('waarschuwing')
    .setDescription('Geeft een waarschuwing aan een lid.')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker die een waarschuwing ontvangt.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reden')
        .setDescription('De reden van de waarschuwing.')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

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
          content: 'Je kunt geen waarschuwing geven aan een bot.',
        });
        return;
      }

      if (member.id === interaction.user.id) {
        await interaction.editReply({
          content: 'Je kunt jezelf geen waarschuwing geven.',
        });
        return;
      }

      const warningChannel = await fetchTextChannel(config.WARNING_CHANNEL_ID);
      if (!warningChannel) {
        await interaction.editReply({
          content: 'Het waarschuwing kanaal kon niet worden gevonden.',
        });

        await sendBotLog(
          '✦ 𝑾𝒂𝒂𝒓𝒔𝒄𝒉𝒖𝒘𝒊𝒏𝒈 𝒌𝒂𝒏𝒂𝒂𝒍 𝒇𝒐𝒖𝒕',
          'Het waarschuwing kanaal kon niet worden gevonden.',
          [{ name: 'Kanaal ID', value: String(config.WARNING_CHANNEL_ID || 'Niet ingesteld'), inline: false }]
        );
        return;
      }

      const embed = createBaseEmbed({
        title: '✦ Waarschuwing uitgedeeld ✦',
        description: `${member} heeft een waarschuwing ontvangen.`,
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

      await warningChannel.send({ embeds: [embed] });

      await interaction.editReply({
        content: `${member.user.tag} heeft succesvol een waarschuwing ontvangen.`,
      });

      await sendBotLog(
        '✦ 𝑾𝒂𝒂𝒓𝒔𝒄𝒉𝒖𝒘𝒊𝒏𝒈 𝒖𝒊𝒕𝒈𝒆𝒅𝒆𝒆𝒍𝒅',
        `${member.user.tag} heeft een waarschuwing ontvangen.`,
        [
          { name: 'Gebruiker', value: member.user.tag, inline: true },
          { name: 'Uitgedeeld door', value: interaction.user.tag, inline: true },
          { name: 'Reden', value: reason.slice(0, 1024), inline: false },
        ]
      );
    } catch (error) {
      console.error('Fout bij /waarschuwing:', error);

      await interaction.editReply({
        content: 'Er ging iets mis bij het uitdelen van de waarschuwing.',
      }).catch(() => null);

      await sendBotLog(
        '✦ 𝑾𝒂𝒂𝒓𝒔𝒄𝒉𝒖𝒘𝒊𝒏𝒈 𝒇𝒐𝒖𝒕',
        'Er ging iets mis bij het uitvoeren van de /waarschuwing command.',
        [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
      );
    }
  },
};