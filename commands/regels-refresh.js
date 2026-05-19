const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('regels-refresh')
    .setDescription('Vernieuwt het regels paneel.'),

  async execute(interaction, context) {
    const { refreshRulesPanel } = context;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'Je hebt geen rechten om het regels paneel te vernieuwen.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await refreshRulesPanel();

      await interaction.editReply({
        content: 'Het regels paneel is succesvol vernieuwd.',
      });
    } catch (error) {
      console.error('Fout bij /regels-refresh:', error);

      await interaction.editReply({
        content: 'Er ging iets mis bij het vernieuwen van het regels paneel.',
      });
    }
  },
};