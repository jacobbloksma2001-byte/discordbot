const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed-banner')
    .setDescription('Stuur een embed met banner')
    .addStringOption(option => option.setName('titel').setDescription('Titel').setRequired(true))
    .addStringOption(option => option.setName('beschrijving').setDescription('Beschrijving').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    const title = interaction.options.getString('titel', true);
    const description = interaction.options.getString('beschrijving', true);
    await interaction.channel.send({
      embeds: [ctx.createBaseEmbed({ title, description, image: true })],
      files: [new AttachmentBuilder(ctx.bannerPath)]
    });
    await interaction.reply({ content: 'Banner embed succesvol verzonden.', ephemeral: true });
  }
};
