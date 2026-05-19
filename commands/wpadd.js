const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { formatMoney, refreshWeaponPrices } = require('./weaponPricesHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wpadd')
    .setDescription('Voeg een wapen toe aan de prijslijst.')
    .addStringOption(option =>
      option
        .setName('wapen')
        .setDescription('Naam van het wapen.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('categorie')
        .setDescription('Categorie van het wapen.')
        .setRequired(true)
        .addChoices(
          { name: 'Pistols', value: 'Pistols' },
          { name: 'Shotguns', value: 'Shotguns' },
          { name: 'Submachine Guns', value: 'Submachine Guns' },
          { name: 'Rifles', value: 'Rifles' },
          { name: 'Steekwapens', value: 'Steekwapens' },
          { name: 'Gereedschap', value: 'Gereedschap' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('inkoopprijs')
        .setDescription('Inkoopprijs van het wapen.')
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName('verkoopprijs')
        .setDescription('Verkoopprijs van het wapen.')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, context) {
    const { pool, sendBotLog } = context;

    const weaponName = interaction.options.getString('wapen', true).trim();
    const category = interaction.options.getString('categorie', true);
    const purchasePrice = interaction.options.getInteger('inkoopprijs', true);
    const sellPrice = interaction.options.getInteger('verkoopprijs', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      const [existing] = await pool.execute(
        'SELECT id FROM weapon_prices WHERE LOWER(weapon_name) = LOWER(?) LIMIT 1',
        [weaponName]
      );

      if (existing.length > 0) {
        await interaction.editReply({
          content: 'Dit wapen bestaat al. Gebruik `/wpedit` om het aan te passen.',
        });
        return;
      }

      await pool.execute(
        `INSERT INTO weapon_prices (weapon_name, category, purchase_price, sell_price)
         VALUES (?, ?, ?, ?)`,
        [weaponName, category, purchasePrice, sellPrice]
      );

      await refreshWeaponPrices(
        context,
        interaction.guild,
        `Wapen toegevoegd door ${interaction.user.tag}`
      );

      await interaction.editReply({
        content: `Wapen **${weaponName}** is toegevoegd in **${category}**.`,
      });

      await sendBotLog(
        '✦ 𝑾𝒂𝒑𝒆𝒏 𝒕𝒐𝒆𝒈𝒆𝒗𝒐𝒆𝒈𝒅',
        `${interaction.user.tag} heeft een wapen toegevoegd.`,
        [
          { name: 'Wapen', value: weaponName, inline: true },
          { name: 'Categorie', value: category, inline: true },
          { name: 'Inkoopprijs', value: formatMoney(purchasePrice), inline: true },
          { name: 'Verkoopprijs', value: formatMoney(sellPrice), inline: true },
        ]
      );
    } catch (error) {
      console.error('Fout bij /wpadd:', error);

      await interaction.editReply({
        content: 'Er ging iets mis bij het toevoegen van het wapen.',
      }).catch(() => null);

      await sendBotLog(
        '✦ 𝑾𝒑𝒂𝒅𝒅 𝒇𝒐𝒖𝒕',
        'Er ging iets mis bij het uitvoeren van /wpadd.',
        [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
      );
    }
  },
};