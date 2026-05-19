const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require('discord.js');

function hasStaffPerms(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

function getPromoteRanks(config) {
  return Array.isArray(config.PROMOTABLE_RANKS) ? config.PROMOTABLE_RANKS : [];
}

function getRankIndex(config, roleId) {
  return getPromoteRanks(config).findIndex(rank => rank.value === roleId);
}

function getHighestPromoteRank(member, config) {
  const promoteRanks = getPromoteRanks(config);
  const promoteIds = new Set(promoteRanks.map(rank => rank.value));

  const memberPromoteRoles = member.roles.cache
    .filter(role => promoteIds.has(role.id))
    .map(role => role.id);

  if (memberPromoteRoles.length === 0) return null;

  memberPromoteRoles.sort((a, b) => getRankIndex(config, b) - getRankIndex(config, a));
  const highestId = memberPromoteRoles[0];

  return promoteRanks.find(rank => rank.value === highestId) || null;
}

function buildPromoteMenu(targetId, currentRank, config) {
  const currentIndex = getRankIndex(config, currentRank.value);

  const options = getPromoteRanks(config)
    .filter((rank, index) => index > currentIndex)
    .map(rank => ({
      label: rank.label,
      value: rank.value
    }));

  if (options.length === 0) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`promote_select:${targetId}`)
      .setPlaceholder('Kies de nieuwe rang')
      .addOptions(options)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promoveer een lid')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker die je wilt promoveren')
        .setRequired(true)
    ),

  async execute(interaction, { config, createBaseEmbed }) {
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
            description: 'Bots kunnen niet gepromoveerd worden.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const currentRank = getHighestPromoteRank(member, config);

    if (!currentRank) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Geen promotierang gevonden',
            description: 'Deze gebruiker heeft geen rang uit de promote-lijst.'
          })
        ],
        ephemeral: true
      });
      return true;
    }

    const menu = buildPromoteMenu(member.id, currentRank, config);

    if (!menu) {
      await interaction.reply({
        embeds: [
          createBaseEmbed({
            title: 'Geen hogere rang beschikbaar',
            description: `${member} heeft al de hoogste promotierang.`,
            thumbnail: member.user.displayAvatarURL({ forceStatic: false }),
            fields: [
              { name: 'Huidige rang', value: currentRank.label, inline: true }
            ]
          })
        ],
        ephemeral: true
      });
      return true;
    }

    await interaction.reply({
      embeds: [
        createBaseEmbed({
          title: 'Promotie starten',
          description: `Kies de nieuwe rang voor ${member}.`,
          thumbnail: member.user.displayAvatarURL({ forceStatic: false }),
          fields: [
            { name: 'Huidige rang', value: currentRank.label, inline: true }
          ]
        })
      ],
      components: [menu],
      ephemeral: true
    });

    return true;
  },

  async handleComponent(interaction, { config }) {
    if (!interaction.isStringSelectMenu()) return false;
    if (!interaction.customId.startsWith('promote_select:')) return false;

    if (!hasStaffPerms(interaction.member)) {
      await interaction.reply({
        content: 'Je hebt hier geen rechten voor.',
        ephemeral: true
      });
      return true;
    }

    const targetId = interaction.customId.split(':')[1];
    const selectedRoleId = interaction.values[0];
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

    if (!targetMember) {
      await interaction.reply({
        content: 'Deze gebruiker kon niet worden gevonden.',
        ephemeral: true
      });
      return true;
    }

    const currentRank = getHighestPromoteRank(targetMember, config);

    if (!currentRank) {
      await interaction.reply({
        content: 'De gebruiker heeft geen geldige promotierang.',
        ephemeral: true
      });
      return true;
    }

    const oldIndex = getRankIndex(config, currentRank.value);
    const newIndex = getRankIndex(config, selectedRoleId);

    if (oldIndex === -1 || newIndex === -1) {
      await interaction.reply({
        content: 'Oude of nieuwe rang is ongeldig.',
        ephemeral: true
      });
      return true;
    }

    if (newIndex <= oldIndex) {
      await interaction.reply({
        content: 'Je kunt alleen promoveren naar een hogere rang.',
        ephemeral: true
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`promote_modal:${targetMember.id}:${selectedRoleId}`)
      .setTitle('Reden van promotie');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Waarom wordt deze persoon gepromoveerd?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(500)
      .setPlaceholder('Bijvoorbeeld: actieve inzet, goede roleplay en veel aanwezigheid');

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput)
    );

    await interaction.showModal(modal);
    return true;
  },

  async handleModal(interaction, {
    client,
    config,
    createBaseEmbed,
    sendBotLog,
    queueMemberListUpdate
  }) {
    if (!interaction.isModalSubmit()) return false;
    if (!interaction.customId.startsWith('promote_modal:')) return false;

    if (!hasStaffPerms(interaction.member)) {
      await interaction.reply({
        content: 'Je hebt hier geen rechten voor.',
        ephemeral: true
      });
      return true;
    }

    const [, targetId, selectedRoleId] = interaction.customId.split(':');
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

    if (!targetMember) {
      await interaction.reply({
        content: 'Deze gebruiker kon niet worden gevonden.',
        ephemeral: true
      });
      return true;
    }

    const currentRank = getHighestPromoteRank(targetMember, config);
    const newRank = getPromoteRanks(config).find(rank => rank.value === selectedRoleId);

    if (!currentRank || !newRank) {
      await interaction.reply({
        content: 'Oude of nieuwe rang kon niet worden bepaald.',
        ephemeral: true
      });
      return true;
    }

    const oldIndex = getRankIndex(config, currentRank.value);
    const newIndex = getRankIndex(config, selectedRoleId);

    if (oldIndex === -1 || newIndex === -1 || newIndex <= oldIndex) {
      await interaction.reply({
        content: 'Je kunt alleen promoveren naar een hogere rang.',
        ephemeral: true
      });
      return true;
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    const guild = interaction.guild;
    const newRole = guild.roles.cache.get(selectedRoleId);

    if (!newRole) {
      await interaction.reply({
        content: 'De geselecteerde rol bestaat niet meer.',
        ephemeral: true
      });
      return true;
    }

    const botMember = guild.members.me;

    if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.reply({
        content: 'Ik mis de permissie Manage Roles.',
        ephemeral: true
      });
      return true;
    }

    if (newRole.position >= botMember.roles.highest.position) {
      await interaction.reply({
        content: 'Ik kan deze rol niet geven omdat hij boven mijn botrol staat.',
        ephemeral: true
      });
      return true;
    }

    const allPromoteRoleIds = getPromoteRanks(config).map(rank => rank.value);
    const rolesToRemove = targetMember.roles.cache
      .filter(role => allPromoteRoleIds.includes(role.id) && role.id !== selectedRoleId)
      .map(role => role.id);

    try {
      if (rolesToRemove.length > 0) {
        await targetMember.roles.remove(
          rolesToRemove,
          `Promotie door ${interaction.user.tag}: ${reason}`
        );
      }

      if (!targetMember.roles.cache.has(selectedRoleId)) {
        await targetMember.roles.add(
          selectedRoleId,
          `Promotie door ${interaction.user.tag}: ${reason}`
        );
      }

      const successEmbed = createBaseEmbed({
        title: 'Promotie uitgevoerd',
        description: `${targetMember} is succesvol gepromoveerd.`,
        thumbnail: targetMember.user.displayAvatarURL({ forceStatic: false }),
        fields: [
          { name: 'Oude Rang', value: currentRank.label, inline: true },
          { name: 'Nieuwe Rang', value: newRank.label, inline: true },
          { name: 'Reden van promotie', value: reason.slice(0, 1024), inline: false },
          { name: 'Uitgevoerd door', value: `${interaction.user}`, inline: true }
        ]
      });

      await interaction.reply({
        embeds: [successEmbed],
        ephemeral: true
      });

      if (config.PROMOTE_LOG_CHANNEL_ID) {
        const promoteChannel = await client.channels.fetch(config.PROMOTE_LOG_CHANNEL_ID).catch(() => null);

        if (promoteChannel && promoteChannel.isTextBased()) {
          const promotionTimestamp = Math.floor(Date.now() / 1000);

          const logEmbed = createBaseEmbed({
            title: 'Gepromoveerd Gefeliciteerd!',
            thumbnail: targetMember.user.displayAvatarURL({ forceStatic: false }),
            fields: [
              { name: 'Naam', value: `${targetMember}`, inline: false },
              { name: 'Oude Rang', value: currentRank.label, inline: true },
              { name: 'Nieuwe Rang', value: newRank.label, inline: true },
              { name: 'Datum en tijd van Promotie', value: `<t:${promotionTimestamp}:F>`, inline: false },
              { name: 'Reden van promotie', value: reason.slice(0, 1024), inline: false },
              { name: 'Wie de promotie heeft uitgevoerd', value: `${interaction.user}`, inline: false }
            ]
          });

          await promoteChannel.send({ embeds: [logEmbed] });
        } else {
          await sendBotLog(
            '✦ 𝑷𝒓𝒐𝒎𝒐𝒕𝒆 𝒌𝒂𝒏𝒂𝒂𝒍 𝒇𝒐𝒖𝒕',
            'Het promote log kanaal kon niet worden gevonden of is niet tekstgebaseerd.'
          );
        }
      }

      await queueMemberListUpdate(
        guild,
        `Promotie uitgevoerd voor ${targetMember.user.tag}`,
        3000
      );

      return true;
    } catch (error) {
      console.error(error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Er ging iets mis bij het uitvoeren van de promotie: ${error.message}`,
          ephemeral: true
        }).catch(() => null);
      } else {
        await interaction.reply({
          content: `Er ging iets mis bij het uitvoeren van de promotie: ${error.message}`,
          ephemeral: true
        }).catch(() => null);
      }

      await sendBotLog(
        '✦ 𝑷𝒓𝒐𝒎𝒐𝒕𝒊𝒆 𝒇𝒐𝒖𝒕',
        `Promotie uitvoeren voor **${targetMember.user.tag}** is mislukt.`,
        [
          { name: 'Fout', value: error.message.slice(0, 1024), inline: false }
        ]
      );

      return true;
    }
  }
};