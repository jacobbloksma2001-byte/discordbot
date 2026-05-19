const { SlashCommandBuilder, isStaff, closeSession, formatDuration, getActivitySettings } = require('../activityHelper');
module.exports = {
  data: new SlashCommandBuilder().setName('uitklok-lid').setDescription('Klok een lid handmatig uit.').addUserOption(option => option.setName('gebruiker').setDescription('Het lid').setRequired(true)).addStringOption(option => option.setName('reden').setDescription('Reden').setRequired(false)),
  async execute(interaction, context) {
    if (!(await isStaff(interaction.member, context.config))) return interaction.reply({ content: 'Alleen kader/staff kan dit command gebruiken.', ephemeral: true });
    const user = interaction.options.getUser('gebruiker', true);
    const reason = interaction.options.getString('reden') || 'Handmatig uitgeklokt door staff';
    const result = await closeSession({ pool: context.pool, guildId: interaction.guild.id, userId: user.id, actorId: interaction.user.id, status: 'forced', endReason: reason });
    if (!result.ok) return interaction.reply({ content: result.reason, ephemeral: true });
    const settings = getActivitySettings(context.config);
    await context.sendLog(settings.LOG_CHANNEL_ID, context.createLogEmbed({ title: '✦ Lid handmatig uitgeklokt ✦', description: `${interaction.user.tag} heeft ${user.tag} uitgeklokt.`, fields: [{ name: 'Reden', value: reason, inline: false }, { name: 'Tijdsduur', value: formatDuration(result.session.duration_seconds), inline: true }] })).catch(() => null);
    await interaction.reply({ content: `${user.tag} is uitgeklokt. Totale sessie: ${formatDuration(result.session.duration_seconds)}.`, ephemeral: true });
  },
};
