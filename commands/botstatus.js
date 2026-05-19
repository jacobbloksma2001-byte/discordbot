const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botstatus')
    .setDescription('Controleer audit logs, banner, autorole en kanaalrechten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    const { config, bannerPath, fetchTextChannel, checkChannelPerms, formatStatus, createBaseEmbed } = ctx;
    const fs = require('fs');

    const me = interaction.guild.members.me;
    const auditOk = me?.permissions.has(PermissionFlagsBits.ViewAuditLog) ?? false;
    const manageRolesOk = me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false;
    const bannerOk = fs.existsSync(bannerPath);
    const memberListChannel = await fetchTextChannel(config.MEMBER_LIST_CHANNEL_ID);
    const botLogChannel = await fetchTextChannel(config.LOG_CHANNELS.botLogs);
    const welcomeChannel = await fetchTextChannel(config.WELCOME_CHANNEL_ID);
    const memberListPerms = checkChannelPerms(memberListChannel, me);
    const botLogPerms = checkChannelPerms(botLogChannel, me);
    const welcomePerms = checkChannelPerms(welcomeChannel, me);
    const autoRole = await interaction.guild.roles.fetch(config.AUTO_ROLE_ID).catch(() => null);
    const hierarchyOk = autoRole && me ? autoRole.position < me.roles.highest.position : false;

    await interaction.reply({
      embeds: [createBaseEmbed({
        title: '✦ 𝑩𝒐𝒕 𝑺𝒕𝒂𝒕𝒖𝒔 ✦',
        description: 'Overzicht van de belangrijkste controles voor logs, banner, autorole en kanalen.',
        fields: [
          { name: 'Audit logs', value: formatStatus(auditOk, 'View Audit Log permissie aanwezig'), inline: false },
          { name: 'Rollenbeheer', value: formatStatus(manageRolesOk, 'Manage Roles permissie aanwezig'), inline: false },
          { name: 'Bannerbestand', value: formatStatus(bannerOk, `ledenlijst-banner.jpg ${bannerOk ? 'gevonden' : 'niet gevonden'}`), inline: false },
          { name: 'Autorole', value: [formatStatus(!!autoRole, `Rol ${config.AUTO_ROLE_ID} gevonden`), formatStatus(hierarchyOk, 'Rol staat onder de hoogste botrol')].join('\n'), inline: false },
          { name: 'Welkomstkanaal', value: [formatStatus(!!welcomeChannel, `Kanaal ${config.WELCOME_CHANNEL_ID} bereikbaar`), formatStatus(welcomePerms.view, 'View Channel'), formatStatus(welcomePerms.send, 'Send Messages'), formatStatus(welcomePerms.embed, 'Embed Links'), formatStatus(welcomePerms.attach, 'Attach Files')].join('\n'), inline: false },
          { name: 'Ledenlijstkanaal', value: [formatStatus(!!memberListChannel, `Kanaal ${config.MEMBER_LIST_CHANNEL_ID} bereikbaar`), formatStatus(memberListPerms.view, 'View Channel'), formatStatus(memberListPerms.send, 'Send Messages'), formatStatus(memberListPerms.embed, 'Embed Links'), formatStatus(memberListPerms.attach, 'Attach Files')].join('\n'), inline: false },
          { name: 'Bot-logkanaal', value: [formatStatus(!!botLogChannel, `Kanaal ${config.LOG_CHANNELS.botLogs} bereikbaar`), formatStatus(botLogPerms.view, 'View Channel'), formatStatus(botLogPerms.send, 'Send Messages'), formatStatus(botLogPerms.embed, 'Embed Links')].join('\n'), inline: false }
        ]
      })],
      ephemeral: true
    });
  }
};
