const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { refreshWeaponPrices } = require('./weaponPricesHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wprefresh')
    .setDescription('Vernieuw de wapenprijzen embed.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, context) {
    await interaction.deferReply({ ephemeral: true });

    const ok = await refreshWeaponPrices(
      context,
      interaction.guild,
      `Handmatige refresh door ${interaction.user.tag}`
    );

    await interaction.editReply({
      content: ok
        ? 'De wapenprijzen embed is vernieuwd.'
        : 'Het vernieuwen van de wapenprijzen embed is mislukt.',
    });
  },
};