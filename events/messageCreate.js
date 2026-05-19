const spamMap = new Map();

function hasLink(content) {
  return /https?:\/\/\S+/i.test(content) || /discord\.gg\/\S+/i.test(content);
}

function isMassMention(message) {
  return (
    message.mentions.users.size + message.mentions.roles.size >= 4 ||
    message.content.includes('@everyone') ||
    message.content.includes('@here')
  );
}

function isSpam(message) {
  const now = Date.now();
  const arr = spamMap.get(message.author.id) || [];
  const recent = arr.filter(ts => now - ts < 5000);
  recent.push(now);
  spamMap.set(message.author.id, recent);
  return recent.length >= 5;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, { config, sendBotLog, createBaseEmbed }) {
    if (!message.guild || !message.author || message.author.bot) return;

    if (config.LINK_BLOCK_ENABLED && hasLink(message.content)) {
      await message.delete().catch(() => null);
      await sendBotLog('✦ Link geblokkeerd', `${message.author.tag} plaatste een link.`, [
        { name: 'Kanaal', value: `${message.channel}`, inline: true },
        { name: 'Inhoud', value: message.content.slice(0, 1024), inline: false }
      ]);
      return;
    }

    if (config.ANTI_TAG_ENABLED && isMassMention(message)) {
      await message.delete().catch(() => null);
      await sendBotLog('✦ Mass mention geblokkeerd', `${message.author.tag} tagde te veel leden.`, [
        { name: 'Kanaal', value: `${message.channel}`, inline: true },
        { name: 'Inhoud', value: message.content.slice(0, 1024), inline: false }
      ]);
      return;
    }

    if (config.ANTI_SPAM_ENABLED && isSpam(message)) {
      await message.delete().catch(() => null);
      await sendBotLog('✦ Spam geblokkeerd', `${message.author.tag} spamde berichten.`, [
        { name: 'Kanaal', value: `${message.channel}`, inline: true }
      ]);
      return;
    }
  }
};