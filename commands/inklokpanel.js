const {
  SlashCommandBuilder,
  getActivitySettings,
  ensureAllowed,
  buildPanelButtons,
  clockInMember,
  closeSession,
  getMemberActivitySummary,
  createActivityEmbed,
  formatDuration,
} = require('../activityHelper');

module.exports = {
  data: new SlashCommandBuilder().setName('inklokpanel').setDescription('Plaats of vernieuw het inklokpaneel.'),

  async execute(interaction, context) {
    const settings = getActivitySettings(context.config);
    if (!settings.PANEL_CHANNEL_ID) return interaction.reply({ content: 'ACTIVITY_SETTINGS.PANEL_CHANNEL_ID ontbreekt.', ephemeral: true });

    const channel = await context.fetchTextChannel(settings.PANEL_CHANNEL_ID);
    if (!channel) return interaction.reply({ content: 'Paneelkanaal niet gevonden.', ephemeral: true });

    const embed = context.createBaseEmbed({
      title: '✦ Activiteitssysteem ✦',
      description: 'Klok in wanneer je begint en klok uit zodra je klaar bent. Jouw activiteit wordt automatisch bijgehouden.',
      image: true,
    });

    await channel.send({ embeds: [embed], components: buildPanelButtons(false) });
    await interaction.reply({ content: `Paneel geplaatst in ${channel}.`, ephemeral: true });
  },

  async handleButton(interaction, context) {
    if (!['activity_clock_in', 'activity_clock_out', 'activity_my_stats'].includes(interaction.customId)) return false;

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
    } catch (error) {
      return true;
    }

    const gate = await ensureAllowed(interaction.member, context.config);
    if (!gate.ok) {
      await interaction.followUp({ content: gate.message, ephemeral: true }).catch(() => null);
      return true;
    }

    const settings = getActivitySettings(context.config);

    if (interaction.customId === 'activity_clock_in') {
      const result = await clockInMember({ pool: context.pool, guild: interaction.guild, member: interaction.member, actorId: interaction.user.id });
      if (!result.ok) { await interaction.followUp({ content: result.reason, ephemeral: true }).catch(() => null); return true; }

      await context.refreshActivityPanels(interaction.guild, 'Lid ingeklokt').catch(() => null);
      await context.sendLog(settings.LOG_CHANNEL_ID, context.createLogEmbed({
        title: '✦ Lid ingeklokt ✦',
        description: `${interaction.user.tag} is ingeklokt.`,
      })).catch(() => null);

      await interaction.followUp({ content: 'Je bent succesvol ingeklokt.', ephemeral: true }).catch(() => null);
      return true;
    }

    if (interaction.customId === 'activity_clock_out') {
      const result = await closeSession({
        pool: context.pool,
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        actorId: interaction.user.id,
        status: 'completed',
        endReason: 'Lid zelf uitgeklokt',
      });
      if (!result.ok) { await interaction.followUp({ content: result.reason, ephemeral: true }).catch(() => null); return true; }

      await context.refreshActivityPanels(interaction.guild, 'Lid uitgeklokt').catch(() => null);
      await context.sendLog(settings.LOG_CHANNEL_ID, context.createLogEmbed({
        title: '✦ Lid uitgeklokt ✦',
        description: `${interaction.user.tag} is uitgeklokt.`,
        fields: [{ name: 'Sessie', value: formatDuration(result.session.duration_seconds), inline: true }],
      })).catch(() => null);

      await interaction.followUp({ content: `Je bent uitgeklokt. Totale sessie: ${formatDuration(result.session.duration_seconds)}.`, ephemeral: true }).catch(() => null);
      return true;
    }

    if (interaction.customId === 'activity_my_stats') {
      const summary = await getMemberActivitySummary(context.pool, interaction.guild.id, interaction.user.id);
      await interaction.followUp({ embeds: [createActivityEmbed(context.createBaseEmbed, interaction.member, summary)], ephemeral: true }).catch(() => null);
      return true;
    }

    return false;
  },
};
