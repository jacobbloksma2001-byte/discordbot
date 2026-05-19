const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed-send')
    .setDescription('Stuur een embed naar een gekozen kanaal')
    .addChannelOption(option =>
      option.setName('kanaal')
        .setDescription('Doelkanaal')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(option => option.setName('titel').setDescription('Titel').setRequired(true))
    .addStringOption(option => option.setName('beschrijving').setDescription('Beschrijving').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    const targetChannel = interaction.options.getChannel('kanaal', true);
    const title = interaction.options.getString('titel', true);
    const description = interaction.options.getString('beschrijving', true);

    await targetChannel.send({
      embeds: [ctx.createBaseEmbed({ title, description, image: true })],
      files: [new AttachmentBuilder(ctx.bannerPath)]
    });

    await ctx.sendBotLog('✦ 𝑬𝒎𝒃𝒆𝒅 𝒗𝒆𝒓𝒛𝒐𝒏𝒅𝒆𝒏', `${interaction.user.tag} heeft een embed verzonden naar ${targetChannel}.`, [
      { name: 'Titel', value: title.slice(0, 256), inline: false }
    ]);

    await interaction.reply({ content: 'Embed succesvol verzonden.', ephemeral: true });
  }
};
