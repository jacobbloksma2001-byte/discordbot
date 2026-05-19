const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testautorole')
    .setDescription('Test de autorole op een gebruiker')
    .addUserOption(option =>
      option.setName('gebruiker')
        .setDescription('De gebruiker die je wilt testen')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, ctx) {
    const { config, sendBotLog } = ctx;
    const user = interaction.options.getUser('gebruiker', true);
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!target) return interaction.reply({ content: 'Gebruiker niet gevonden in deze server.', ephemeral: true });

    try {
      const role = await interaction.guild.roles.fetch(config.AUTO_ROLE_ID).catch(() => null);
      if (!role) return interaction.reply({ content: 'Autorole niet gevonden.', ephemeral: true });

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ content: 'Bot mist Manage Roles.', ephemeral: true });
      }

      if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({ content: 'Autorole staat te hoog in de rolhiërarchie.', ephemeral: true });
      }

      await target.roles.add(role.id, 'Handmatige autorole test');
      await sendBotLog('✦ Autorole test geslaagd', `Autorole getest op **${target.user.tag}**.`, [
        { name: 'Rol', value: `${role.name} (${role.id})`, inline: false },
        { name: 'Gebruiker', value: `${target.user.tag} (${target.id})`, inline: false }
      ]);

      return interaction.reply({ content: `Autorole toegevoegd aan ${target.user.tag}.`, ephemeral: true });
    } catch (error) {
      await sendBotLog('✦ Autorole test fout', `Autorole test faalde op **${target.user.tag}**.`, [
        { name: 'Fout', value: error.message.slice(0, 1024), inline: false }
      ]);
      return interaction.reply({ content: 'Autorole kon niet worden toegevoegd.', ephemeral: true });
    }
  }
};
