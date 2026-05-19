const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Leeg het huidige kanaal door recente berichten te verwijderen.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, ctx) {
    const channel = interaction.channel;

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

    let deleted = 0;

    try {
      while (true) {
        const messages = await channel.messages.fetch({ limit: 100 });
        const deletable = messages.filter(msg => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000);

        if (!deletable.size) break;

        const result = await channel.bulkDelete(deletable, true);
        deleted += result.size;

        if (deletable.size < 2) break;
      }

      if (typeof ctx.sendBotLog === 'function') {
        await ctx.sendBotLog(
          '✦ Kanaal gepurged',
          `${interaction.user.tag} heeft berichten verwijderd in #${channel.name}.`,
          [
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Verwijderd', value: String(deleted), inline: true },
            { name: 'Uitgevoerd door', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
          ]
        ).catch(() => null);
      }

      return interaction.editReply({
        content: deleted > 0
          ? `Kanaal opgeschoond. ${deleted} berichten verwijderd (maximaal tot 14 dagen oud).`
          : 'Er waren geen recente berichten om te verwijderen. Discord kan geen berichten ouder dan 14 dagen bulk verwijderen.',
      });
    } catch (error) {
      console.error(error);
      return interaction.editReply({
        content: 'Er ging iets mis tijdens het leegmaken van dit kanaal.',
      });
    }
  },
};
