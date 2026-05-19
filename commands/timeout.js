const {
  SlashCommandBuilder,
  PermissionsBitField,
} = require('discord.js');

function hasStaffRole(member, config) {
  if (!member || !member.roles?.cache) return false;
  return (config.RANK_ROLES || []).some(rank => member.roles.cache.has(rank.id));
}

function parseDuration(input) {
  if (!input) return null;

  const match = String(input).toLowerCase().trim().match(/^(\d+)(m|h|d|w)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  const multipliers = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}

function formatDuration(input) {
  return String(input).toLowerCase().trim();
}

function canTarget(interaction, targetMember) {
  const actor = interaction.member;
  const botMember = interaction.guild.members.me;

  if (!actor || !targetMember || !botMember) {
    return { ok: false, reason: 'Lidgegevens konden niet goed worden opgehaald.' };
  }

  if (targetMember.id === actor.id) {
    return { ok: false, reason: 'Je kunt jezelf geen timeout geven.' };
  }

  if (targetMember.id === botMember.id) {
    return { ok: false, reason: 'Ik kan mijzelf geen timeout geven.' };
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return { ok: false, reason: 'De server eigenaar kan geen timeout krijgen.' };
  }

  if (actor.roles.highest.position <= targetMember.roles.highest.position) {
    return { ok: false, reason: 'Je kunt geen lid timeouten met een gelijke of hogere rol.' };
  }

  if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
    return { ok: false, reason: 'Mijn rol staat niet hoog genoeg om deze gebruiker een timeout te geven.' };
  }

  if (!targetMember.moderatable) {
    return { ok: false, reason: 'Deze gebruiker is niet moderatable door de bot.' };
  }

  return { ok: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Geef een lid een timeout.')
    .addUserOption(option =>
      option
        .setName('gebruiker')
        .setDescription('De gebruiker die je een timeout wilt geven')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('duur')
        .setDescription('Bijv: 10m, 1h, 2d, 1w')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reden')
        .setDescription('Reden van de timeout')
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

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Geen permissie ✦',
            description: 'Je hebt geen `Moderate Members` permissie.',
          }),
        ],
        ephemeral: true,
      });
    }

    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Bot permissie ontbreekt ✦',
            description: 'Ik heb geen `Moderate Members` permissie.',
          }),
        ],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser('gebruiker', true);
    const durationInput = interaction.options.getString('duur', true);
    const reason = interaction.options.getString('reden') || 'Geen reden opgegeven.';
    const durationMs = parseDuration(durationInput);

    if (!durationMs) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Ongeldige duur ✦',
            description: 'Gebruik een geldige duur zoals `10m`, `1h`, `2d` of `1w`.',
          }),
        ],
        ephemeral: true,
      });
    }

    const maxTimeout = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxTimeout) {
      return interaction.reply({
        embeds: [
          createBaseEmbed({
            title: '✦ Duur te lang ✦',
            description: 'Een timeout mag maximaal 28 dagen zijn.',
          }),
        ],
        ephemeral: true,
      });
    }

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
            title: '✦ Je hebt een timeout gekregen ✦',
            description: `Je hebt een timeout gekregen in **${interaction.guild.name}**.`,
            fields: [
              { name: 'Duur', value: formatDuration(durationInput), inline: true },
              { name: 'Reden', value: reason, inline: false },
              { name: 'Door', value: interaction.user.tag, inline: true },
            ],
          }),
        ],
      }).catch(() => null);

      await targetMember.timeout(durationMs, `${reason} | Door: ${interaction.user.tag}`);

      await interaction.editReply({
        embeds: [
          createBaseEmbed({
            title: '✦ Timeout gegeven ✦',
            description: `**${targetUser.tag}** heeft een timeout gekregen.`,
            fields: [
              { name: 'Gebruiker', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
              { name: 'Duur', value: formatDuration(durationInput), inline: true },
              { name: 'Door', value: interaction.user.tag, inline: true },
              { name: 'Reden', value: reason, inline: false },
            ],
          }),
        ],
      });

      await sendLog(
        config.LOG_CHANNELS?.memberTimeout,
        createLogEmbed({
          title: '✦ 𝑳𝒊𝒅 𝒈𝒆𝒕𝒊𝒎𝒆𝒐𝒖𝒕',
          description: `${targetUser.tag} heeft een timeout gekregen via slash command.`,
          fields: [
            { name: 'Gebruiker', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
            { name: 'Door', value: interaction.user.tag, inline: true },
            { name: 'Duur', value: formatDuration(durationInput), inline: true },
            { name: 'Reden', value: reason, inline: false },
          ],
        })
      );
    } catch (error) {
      console.error('Timeout command fout:', error);

      await interaction.editReply({
        embeds: [
          createBaseEmbed({
            title: '✦ Timeout mislukt ✦',
            description: 'Er ging iets mis bij het geven van de timeout.',
            fields: [
              { name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false },
            ],
          }),
        ],
      });
    }
  },
};