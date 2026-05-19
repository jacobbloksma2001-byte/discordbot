const {
  SlashCommandBuilder,
  PermissionsBitField,
} = require('discord.js');

function hasStaffRole(member, config) {
  if (!member || !member.roles?.cache) return false;
  return (config.RANK_ROLES || []).some(rank => member.roles.cache.has(rank.id));
}

function canTarget(interaction, targetMember) {
  const actor = interaction.member;
  const botMember = interaction.guild.members.me;

  if (!actor || !targetMember || !botMember) {
    return { ok: false, reason: 'Lidgegevens konden niet goed worden opgehaald.' };
  }

  if (targetMember.id === actor.id) {
    return { ok: false, reason: 'Je kunt jezelf niet verbannen.' };
  }

  if (targetMember.id === botMember.id) {
    return { ok: false, reason: 'Ik kan mijzelf niet verbannen.' };
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return { ok: false, reason: 'De server eigenaar kan niet worden verbannen.' };
  }

  if (actor.roles.highest.position <= targetMember.roles.highest.position) {
    return { ok: false, reason: 'Je kunt geen lid verbannen met een gelijke of hogere rol.' };
  }

  if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
    return { ok: false, reason: 'Mijn rol staat niet hoog genoeg om deze gebruiker te verbannen.' };
  }

  if (!targetMember.bannable) {
    return { ok: false, reason: 'Deze gebruiker is niet bannable door de bot.' };
  }

  return { ok: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Verban een lid uit de server.')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker die je wilt verbannen')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reden')
        .setDescription('Reden van de ban')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('verwijder_berichten')
        .setDescription('Verwijder recente berichten van deze gebruiker')
        .setRequired(false)
    ),

  async execute(interaction, context) {
    const { config, createBaseEmbed, createLogEmbed, sendLog } = context;

    if (!interaction.guild) {
      return interaction.reply({
        content: 'Dit commando kan alleen in een server worden gebruikt.',
        ephemeral: true,
      });
    }

    if (!hasStaffRole(interaction.member, config)) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Geen toegang ✦',
            description: 'Jij hebt geen toegang tot dit commando.',
          }),
        ],
        ephemeral: true,
      });
    }

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Geen permissie ✦',
            description: 'Je hebt geen `Ban Members` permissie.',
          }),
        ],
        ephemeral: true,
      });
    }

    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Bot permissie ontbreekt ✦',
            description: 'Ik heb geen `Ban Members` permissie.',
          }),
        ],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('gebruiker', true);
    const reason = interaction.options.getString('reden') || 'Geen reden opgegeven.';
    const deleteMessages = interaction.options.getBoolean('verwijder_berichten') ?? false;

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Gebruiker niet gevonden ✦',
            description: 'Deze gebruiker zit niet in de server of kon niet worden opgehaald.',
          }),
        ],
        ephemeral: true,
      });
    }

    const moderationCheck = canTarget(interaction, targetMember);
    if (!moderationCheck.ok) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Actie geweigerd ✦',
            description: moderationCheck.reason,
          }),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await targetUser.send({
        embeds: [
          createBaseEmbed({
            title: '✦ Je bent verbannen ✦',
            description: `Je bent verbannen uit **${interaction.guild.name}**.`,
            fields: [
              { name: 'Reden', value: reason, inline: false },
              { name: 'Door', value: interaction.user.tag, inline: true },
            ],
          }),
        ],
      }).catch(() => null);

      await targetMember.ban({
        deleteMessageSeconds: deleteMessages ? 86400 : 0,
        reason: `${reason} | Door: ${interaction.user.tag}`,
      });

      await interaction.editReply({
        embeds: [
          createBaseEmbed({
            title: '✦ Lid verbannen ✦',
            description: `**${targetUser.tag}** is succesvol verbannen.`,
            fields: [
              { name: 'Gebruiker', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
              { name: 'Reden', value: reason, inline: false },
              { name: 'Door', value: interaction.user.tag, inline: true },
              { name: 'Berichten verwijderd', value: deleteMessages ? 'Ja, laatste 24 uur' : 'Nee', inline: true },
            ],
          }),
        ],
      });

      await sendLog(
        config.LOG_CHANNELS?.memberBan,
        createLogEmbed({
          title: '✦ 𝑳𝒊𝒅 𝒈𝒆𝒃𝒂𝒏𝒅',
          description: `${targetUser.tag} is verbannen via slash command.`,
          fields: [
            { name: 'Gebruiker', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
            { name: 'Door', value: interaction.user.tag, inline: true },
            { name: 'Reden', value: reason, inline: false },
          ],
        })
      );
    } catch (error) {
      console.error('Ban command fout:', error);

      await interaction.editReply({
        embeds: [
          createBaseEmbed({
            title: '✦ Ban mislukt ✦',
            description: 'Er ging iets mis bij het verbannen van dit lid.',
            fields: [
              { name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false },
            ],
          }),
        ],
      });
    }
  },
};