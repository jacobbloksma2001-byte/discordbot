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
    return { ok: false, reason: 'Je kunt jezelf niet kicken.' };
  }

  if (targetMember.id === botMember.id) {
    return { ok: false, reason: 'Ik kan mijzelf niet kicken.' };
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return { ok: false, reason: 'De server eigenaar kan niet worden gekickt.' };
  }

  if (actor.roles.highest.position <= targetMember.roles.highest.position) {
    return { ok: false, reason: 'Je kunt geen lid kicken met een gelijke of hogere rol.' };
  }

  if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
    return { ok: false, reason: 'Mijn rol staat niet hoog genoeg om deze gebruiker te kicken.' };
  }

  if (!targetMember.kickable) {
    return { ok: false, reason: 'Deze gebruiker is niet kickable door de bot.' };
  }

  return { ok: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick een lid uit de server.')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker die je wilt kicken')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reden')
        .setDescription('Reden van de kick')
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

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Geen permissie ✦',
            description: 'Je hebt geen `Kick Members` permissie.',
          }),
        ],
        ephemeral: true,
      });
    }

    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Bot permissie ontbreekt ✦',
            description: 'Ik heb geen `Kick Members` permissie.',
          }),
        ],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('gebruiker', true);
    const reason = interaction.options.getString('reden') || 'Geen reden opgegeven.';

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
            title: '✦ Je bent gekickt ✦',
            description: `Je bent verwijderd uit **${interaction.guild.name}**.`,
            fields: [
              { name: 'Reden', value: reason, inline: false },
              { name: 'Door', value: interaction.user.tag, inline: true },
            ],
          }),
        ],
      }).catch(() => null);

      await targetMember.kick(`${reason} | Door: ${interaction.user.tag}`);

      await interaction.editReply({
        embeds: [
          createBaseEmbed({
            title: '✦ Lid gekickt ✦',
            description: `**${targetUser.tag}** is succesvol gekickt.`,
            fields: [
              { name: 'Gebruiker', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
              { name: 'Reden', value: reason, inline: false },
              { name: 'Door', value: interaction.user.tag, inline: true },
            ],
          }),
        ],
      });

      await sendLog(
        config.LOG_CHANNELS?.memberKick,
        createLogEmbed({
          title: '✦ 𝑳𝒊𝒅 𝒈𝒆𝒌𝒊𝒄𝒌𝒕',
          description: `${targetUser.tag} is gekickt via slash command.`,
          fields: [
            { name: 'Gebruiker', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
            { name: 'Door', value: interaction.user.tag, inline: true },
            { name: 'Reden', value: reason, inline: false },
          ],
        })
      );
    } catch (error) {
      console.error('Kick command fout:', error);

      await interaction.editReply({
        embeds: [
          createBaseEmbed({
            title: '✦ Kick mislukt ✦',
            description: 'Er ging iets mis bij het kicken van dit lid.',
            fields: [
              { name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false },
            ],
          }),
        ],
      });
    }
  },
};