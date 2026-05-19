const { SlashCommandBuilder } = require('discord.js');
const { isStaff, getActiveSession } = require('../activityHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-activiteit')
    .setDescription('Reset de activiteitstijd van een lid.')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('Het lid waarvan je de activiteit wilt resetten')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName('ook_uitklokken')
        .setDescription('Klok het lid ook direct uit')
        .setRequired(false)
    ),

  async execute(interaction, context) {
    if (!(await isStaff(interaction.member, context.config))) {
      return interaction.reply({ content: 'Alleen kader/staff kan dit command gebruiken.', ephemeral: true });
    }

    const user = interaction.options.getUser('gebruiker', true);
    const alsoClockOut = interaction.options.getBoolean('ook_uitklokken') ?? false;

    const activeSession = await getActiveSession(context.pool, interaction.guild.id, user.id);

    await context.pool.execute(
      `UPDATE activity_sessions
       SET started_at = NOW(),
           last_check_confirmed_at = NOW(),
           check_sent_at = NULL,
           check_deadline_at = NULL,
           missed_checks = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ? AND user_id = ? AND status = 'active'`,
      [interaction.guild.id, user.id]
    );

    await context.pool.execute(
      `UPDATE activity_weekly_stats
       SET total_seconds = 0,
           sessions_count = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ? AND user_id = ? AND week_key = ?`,
      [interaction.guild.id, user.id, context.activityHelper.getWeekKey(new Date())]
    );

    await context.pool.execute(
      `UPDATE activity_sessions
       SET duration_seconds = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ?
         AND user_id = ?
         AND ended_at IS NOT NULL
         AND DATE(ended_at) = CURDATE()`,
      [interaction.guild.id, user.id]
    );

    if (alsoClockOut && activeSession) {
      await context.pool.execute(
        `UPDATE activity_sessions
         SET ended_at = NOW(),
             duration_seconds = 0,
             status = 'forced',
             ended_by = ?,
             end_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [interaction.user.id, 'Activiteit handmatig gereset door kader/staff', activeSession.id]
      );
    }

    await context.refreshActivityPanels(interaction.guild, `Activiteit gereset voor ${user.tag}`).catch(() => null);

    const resultText = alsoClockOut && activeSession
      ? `${user.tag} is uitgeklokt en de activiteit is gereset.`
      : `${user.tag} zijn/haar activiteitstijd is gereset.`;

    if (context.sendLog && context.config.ACTIVITY_SETTINGS?.LOG_CHANNEL_ID) {
      await context.sendLog(
        context.config.ACTIVITY_SETTINGS.LOG_CHANNEL_ID,
        context.createLogEmbed({
          title: '✦ Activiteit gereset ✦',
          description: `${interaction.user.tag} heeft de activiteit van ${user.tag} gereset.`,
          fields: [
            { name: 'Gebruiker', value: user.tag, inline: true },
            { name: 'Ook uitgeklokt', value: alsoClockOut ? 'Ja' : 'Nee', inline: true }
          ]
        })
      ).catch(() => null);
    }

    return interaction.reply({ content: resultText, ephemeral: true });
  }
};
