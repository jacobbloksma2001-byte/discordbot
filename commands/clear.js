const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Verwijder een bepaald aantal recente berichten uit het huidige kanaal.')
    .addIntegerOption(option =>
      option
        .setName('aantal')
        .setDescription('Aantal berichten om te verwijderen (1 t/m 100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, ctx) {
    const channel = interaction.channel;
    const amount = interaction.options.getInteger('aantal', true);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: 'Dit commando werkt alleen in een normaal tekstkanaal.',
        ephemeral: true,
      });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'De bot mist de permissie Manage Messages in dit kanaal.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const fetched = await channel.messages.fetch({ limit: amount });
      const result = await channel.bulkDelete(fetched, true);
      const deleted = result.size;

      if (typeof ctx.sendBotLog === 'function') {
        await ctx.sendBotLog(
          '✦ Berichten verwijderd',
          `${interaction.user.tag} heeft berichten verwijderd in #${channel.name}.`,
          [
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Gevraagd', value: String(amount), inline: true },
            { name: 'Verwijderd', value: String(deleted), inline: true },
            { name: 'Uitgevoerd door', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
          ]
        ).catch(() => null);
      }

      return interaction.editReply({
        content: deleted > 0
          ? `${deleted} berichten verwijderd (alleen berichten jonger dan 14 dagen tellen mee).`
          : 'Er zijn geen verwijderbare recente berichten gevonden. Discord slaat berichten ouder dan 14 dagen over.',
      });
    } catch (error) {
      console.error(error);
      return interaction.editReply({
        content: 'Er ging iets mis bij het verwijderen van de berichten.',
      });
    }
  },
};
