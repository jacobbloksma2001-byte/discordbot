const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { refreshWeaponPrices } = require('./weaponPricesHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wpdelete')
    .setDescription('Verwijder een wapen uit de prijslijst.')
    .addStringOption(option =>
      option
        .setName('wapen')
        .setDescription('Naam van het wapen.')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, context) {
    const { pool, sendBotLog } = context;
    const weaponName = interaction.options.getString('wapen', true).trim();

    await interaction.deferReply({ ephemeral: true });

    try {
      const [result] = await pool.execute(
        'DELETE FROM weapon_prices WHERE LOWER(weapon_name) = LOWER(?)',
        [weaponName]
      );

      if (result.affectedRows === 0) {
        await interaction.editReply({
          content: 'Dit wapen bestaat niet in de lijst.',
        });
        return;
      }

      await refreshWeaponPrices(
        context,
        interaction.guild,
        `Wapen verwijderd door ${interaction.user.tag}`
      );

      await interaction.editReply({
        content: `Wapen **${weaponName}** is verwijderd uit de prijslijst.`,
      });

      await sendBotLog(
        '✦ 𝑾𝒂𝒑𝒆𝒏 𝒗𝒆𝒓𝒘𝒊𝒋𝒅𝒆𝒓𝒅',
        `${interaction.user.tag} heeft een wapen verwijderd.`,
        [{ name: 'Wapen', value: weaponName, inline: true }]
      );
    } catch (error) {
      console.error('Fout bij /wpdelete:', error);

      await interaction.editReply({
        content: 'Er ging iets mis bij het verwijderen van het wapen.',
      }).catch(() => null);

      await sendBotLog(
        '✦ 𝑾𝒑𝒅𝒆𝒍𝒆𝒕𝒆 𝒇𝒐𝒖𝒕',
        'Er ging iets mis bij het uitvoeren van /wpdelete.',
        [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
      );
    }
  },
};