const { SlashCommandBuilder } = require('discord.js');
const { isStaff } = require('../activityHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-activiteit-iedereen')
    .setDescription('Reset de activiteitstijd van iedereen.')
    .addBooleanOption(option =>
      option
        .setName('ook_uitklokken')
        .setDescription('Klok iedereen met een actieve sessie ook direct uit')
        .setRequired(false)
    ),

  async execute(interaction, context) {
    if (!(await isStaff(interaction.member, context.config))) {
      return interaction.reply({ content: 'Alleen kader/staff kan dit command gebruiken.', ephemeral: true });
    }

    const alsoClockOut = interaction.options.getBoolean('ook_uitklokken') ?? false;
    const guildId = interaction.guild.id;
    const weekKey = context.activityHelper.getWeekKey(new Date());

    const [activeRows] = await context.pool.execute(
      `SELECT id FROM activity_sessions WHERE guild_id = ? AND status = 'active'`,
      [guildId]
    );

    await context.pool.execute(
      `UPDATE activity_sessions
       SET started_at = NOW(),
           last_check_confirmed_at = NOW(),
           check_sent_at = NULL,
           check_deadline_at = NULL,
           missed_checks = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ? AND status = 'active'`,
      [guildId]
    );

    await context.pool.execute(
      `DELETE FROM activity_weekly_stats
       WHERE guild_id = ? AND week_key = ?`,
      [guildId, weekKey]
    );

    await context.pool.execute(
      `UPDATE activity_sessions
       SET duration_seconds = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ?
         AND ended_at IS NOT NULL
         AND DATE(ended_at) = CURDATE()`,
      [guildId]
    );

    if (alsoClockOut && activeRows.length > 0) {
      await context.pool.execute(
        `UPDATE activity_sessions
         SET ended_at = NOW(),
             duration_seconds = 0,
             status = 'forced',
             ended_by = ?,
             end_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE guild_id = ? AND status = 'active'`,
        [interaction.user.id, 'Activiteit van iedereen handmatig gereset door kader/staff', guildId]
      );
    }

    await context.refreshActivityPanels(interaction.guild, 'Activiteit van iedereen gereset').catch(() => null);

    const resultText = alsoClockOut
      ? `De activiteit van iedereen is gereset en ${activeRows.length} actieve sessie(s) zijn uitgeklokt.`
      : 'De activiteit van iedereen is gereset.';

    if (context.sendLog && context.config.ACTIVITY_SETTINGS?.LOG_CHANNEL_ID) {
      await context.sendLog(
        context.config.ACTIVITY_SETTINGS.LOG_CHANNEL_ID,
        context.createLogEmbed({
          title: '✦ Activiteit iedereen gereset ✦',
          description: `${interaction.user.tag} heeft de activiteit van iedereen gereset.`,
          fields: [
            { name: 'Ook uitgeklokt', value: alsoClockOut ? 'Ja' : 'Nee', inline: true },
            { name: 'Actieve sessies gevonden', value: String(activeRows.length), inline: true }
          ]
        })
      ).catch(() => null);
    }

    return interaction.reply({ content: resultText, ephemeral: true });
  }
};
