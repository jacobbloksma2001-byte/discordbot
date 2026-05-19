const { SlashCommandBuilder, isStaff, getMemberActivitySummary, createActivityEmbed } = require('../activityHelper');
module.exports = {
  data: new SlashCommandBuilder().setName('activiteit-lid').setDescription('Bekijk activiteit van een lid.').addUserOption(option => option.setName('gebruiker').setDescription('Het lid').setRequired(true)),
  async execute(interaction, context) {
    if (!(await isStaff(interaction.member, context.config))) return interaction.reply({ content: 'Alleen kader/staff kan dit command gebruiken.', ephemeral: true });
    const user = interaction.options.getUser('gebruiker', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const summary = await getMemberActivitySummary(context.pool, interaction.guild.id, user.id);
    await interaction.reply({ embeds: [createActivityEmbed(context.createBaseEmbed, member || user, summary)], ephemeral: true });
  },
};
