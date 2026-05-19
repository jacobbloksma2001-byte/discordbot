const { SlashCommandBuilder, getWeeklyRanking, createRankingEmbed } = require('../activityHelper');
module.exports = {
  data: new SlashCommandBuilder().setName('klassement').setDescription('Bekijk het publieke weekklassement.'),
  async execute(interaction, context) {
    const ranking = await getWeeklyRanking(context.pool, interaction.guild.id, 10);
    await interaction.reply({ embeds: [createRankingEmbed(context.createBaseEmbed, interaction.guild, ranking, interaction.user.id)] });
  },
};
