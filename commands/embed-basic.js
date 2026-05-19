const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed-basic')
    .setDescription('Stuur een basic embed')
    .addStringOption(option => option.setName('titel').setDescription('Titel').setRequired(true))
    .addStringOption(option => option.setName('beschrijving').setDescription('Beschrijving').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    const title = interaction.options.getString('titel', true);
    const description = interaction.options.getString('beschrijving', true);
    await interaction.channel.send({ embeds: [ctx.createBaseEmbed({ title, description })] });
    await interaction.reply({ content: 'Embed succesvol verzonden.', ephemeral: true });
  }
};
