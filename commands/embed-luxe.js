const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed-luxe')
    .setDescription('Stuur een luxe embed met velden')
    .addStringOption(option => option.setName('titel').setDescription('Titel').setRequired(true))
    .addStringOption(option => option.setName('beschrijving').setDescription('Beschrijving').setRequired(true))
    .addStringOption(option => option.setName('veld1').setDescription('Naam van veld 1').setRequired(false))
    .addStringOption(option => option.setName('waarde1').setDescription('Waarde van veld 1').setRequired(false))
    .addStringOption(option => option.setName('veld2').setDescription('Naam van veld 2').setRequired(false))
    .addStringOption(option => option.setName('waarde2').setDescription('Waarde van veld 2').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    const title = interaction.options.getString('titel', true);
    const description = interaction.options.getString('beschrijving', true);
    const field1 = interaction.options.getString('veld1');
    const value1 = interaction.options.getString('waarde1');
    const field2 = interaction.options.getString('veld2');
    const value2 = interaction.options.getString('waarde2');

    const fields = [];
    if (field1 && value1) fields.push({ name: field1, value: value1, inline: false });
    if (field2 && value2) fields.push({ name: field2, value: value2, inline: false });

    await interaction.channel.send({
      embeds: [ctx.createBaseEmbed({ title, description, fields, image: true })],
      files: [new AttachmentBuilder(ctx.bannerPath)]
    });
    await interaction.reply({ content: 'Luxe embed succesvol verzonden.', ephemeral: true });
  }
};
