const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ledenlijst')
    .setDescription('Werk de ledenlijst handmatig bij')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    ctx.queueMemberListUpdate(interaction.guild, `Handmatig vernieuwd door ${interaction.user.tag}`, 1000);
    await interaction.reply({ content: 'De ledenlijst-update is ingepland.', ephemeral: true });
  }
};
