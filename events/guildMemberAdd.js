module.exports = {
  name: 'guildMemberAdd',
  async execute(member, { config, sendBotLog }) {
    if (!config.ANTI_ALT_ENABLED) return;

    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const accountAgeDays = Math.floor(accountAgeMs / 86400000);

    if (accountAgeDays < 7) {
      if (config.ANTI_ALT_ROLE_ID) {
        await member.roles.add(config.ANTI_ALT_ROLE_ID).catch(() => null);
      }

      await sendBotLog('✦ Anti-alt detectie', `${member.user.tag} heeft een jong account.`, [
        { name: 'Account leeftijd', value: `${accountAgeDays} dagen`, inline: true }
      ]);
    }
  }
};