const {
  SlashCommandBuilder,
  PermissionsBitField
} = require('discord.js');

function hasStaffPerms(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

function getProtectedRoleIds(config) {
  const ids = new Set();

  if (Array.isArray(config.ROLE_WIPE_PROTECTED_ROLE_IDS)) {
    for (const id of config.ROLE_WIPE_PROTECTED_ROLE_IDS) {
      if (id) ids.add(id);
    }
  }

  if (config.AUTO_ROLE_ID) ids.add(config.AUTO_ROLE_ID);
  if (config.STARTER_ROLE_1_ID) ids.add(config.STARTER_ROLE_1_ID);
  if (config.STARTER_ROLE_2_ID) ids.add(config.STARTER_ROLE_2_ID);

  return ids;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolewipe')
    .setDescription('Verwijdert alle niet-beschermde rollen van een gebruiker.')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker waarvan je de rollen wilt wissen')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reden')
        .setDescription('De reden van de rolewipe')
        .setRequired(true)
        .setMaxLength(500)
    ),

  async execute(interaction, {
    config,
    createBaseEmbed,
    sendBotLog,
    queueMemberListUpdate
  }) {
    if (!hasStaffPerms(interaction.member)) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Geen toegang',
            description: 'Je hebt geen rechten om deze command te gebruiken.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const user = interaction.options.getUser('gebruiker');
    const reason = interaction.options.getString('reden', true).trim();

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Niet gevonden',
            description: 'Deze gebruiker zit niet in de server.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    if (user.bot) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Niet toegestaan',
            description: 'Bots kunnen niet met rolewipe verwerkt worden.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const botMember = interaction.guild.members.me;

    if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Permissie ontbreekt',
            description: 'Ik mis de permissie Manage Roles.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const protectedRoleIds = getProtectedRoleIds(config);

    const removableRoles = member.roles.cache.filter(role => {
      if (role.id === interaction.guild.id) return false;
      if (protectedRoleIds.has(role.id)) return false;
      if (role.position >= botMember.roles.highest.position) return false;
      return true;
    });

    if (removableRoles.size === 0) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Geen rollen om te verwijderen',
            description: `${member} heeft geen verwijderbare rollen.`,
            thumbnail: member.user.displayAvatarURL({ forceStatic: false }),
            fields: [
              {
                name: 'Beschermde rollen',
                value: Array.from(protectedRoleIds).map(id => `<@&${id}>`).join('\n').slice(0, 1024) || 'Geen',
                inline: false
              }
            ]
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const removedRoleNames = removableRoles.map(role => role.name);

    try {
      await member.roles.remove(
        removableRoles,
        `Rolewipe door ${interaction.user.tag}: ${reason}`
      );

      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Rolewipe uitgevoerd',
            description: `${member} heeft een rolewipe gekregen.`,
            thumbnail: member.user.displayAvatarURL({ forceStatic: false }),
            fields: [
              { name: 'Gebruiker', value: `${member}`, inline: true },
              { name: 'Aantal verwijderde rollen', value: String(removableRoles.size), inline: true },
              { name: 'Uitgevoerd door', value: `${interaction.user}`, inline: true },
              {
                name: 'Verwijderde rollen',
                value: removedRoleNames.join('\n').slice(0, 1024) || 'Geen',
                inline: false
              },
              {
                name: 'Reden',
                value: reason.slice(0, 1024),
                inline: false
              }
            ]
          })
        ],
        ephemeral: true
      });

      await sendBotLog(
        '✦ 𝑹𝒐𝒍𝒆𝒘𝒊𝒑𝒆 𝒖𝒊𝒕𝒈𝒆𝒗𝒐𝒆𝒓𝒅',
        `Er is een rolewipe uitgevoerd voor **${member.user.tag}**.`,
        [
          { name: 'Gebruiker', value: `${member.user.tag} (${member.id})`, inline: false },
          { name: 'Uitgevoerd door', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
          { name: 'Aantal verwijderde rollen', value: String(removableRoles.size), inline: true },
          { name: 'Reden', value: reason.slice(0, 1024), inline: false },
          {
            name: 'Verwijderde rollen',
            value: removedRoleNames.join('\n').slice(0, 1024) || 'Geen',
            inline: false
          }
        ]
      );

      await queueMemberListUpdate(
        interaction.guild,
        `Rolewipe uitgevoerd voor ${member.user.tag}`,
        3000
      );

      return true;
    } catch (error) {
      console.error(error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Er ging iets mis bij de rolewipe: ${error.message}`,
          ephemeral: true
        }).catch(() => null);
      } else {
        await interaction.reply({
          content: `Er ging iets mis bij de rolewipe: ${error.message}`,
          ephemeral: true
        }).catch(() => null);
      }

      await sendBotLog(
        '✦ 𝑹𝒐𝒍𝒆𝒘𝒊𝒑𝒆 𝒇𝒐𝒖𝒕',
        `Rolewipe uitvoeren voor **${member.user.tag}** is mislukt.`,
        [
          { name: 'Fout', value: error.message.slice(0, 1024), inline: false }
        ]
      );

      return true;
    }
  }
};