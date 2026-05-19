const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { formatMoney, refreshWeaponPrices } = require('./weaponPricesHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wpedit')
    .setDescription('Pas een wapen uit de prijslijst aan.')
    .addStringOption(option =>
      option
        .setName('wapen')
        .setDescription('Naam van het wapen dat je wilt aanpassen.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('categorie')
        .setDescription('Nieuwe categorie.')
        .setRequired(false)
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
        .setDescription('Nieuwe inkoopprijs.')
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName('verkoopprijs')
        .setDescription('Nieuwe verkoopprijs.')
        .setRequired(false)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, context) {
    const { pool, sendBotLog } = context;

    const weaponName = interaction.options.getString('wapen', true).trim();
    const category = interaction.options.getString('categorie');
    const purchasePrice = interaction.options.getInteger('inkoopprijs');
    const sellPrice = interaction.options.getInteger('verkoopprijs');

    await interaction.deferReply({ ephemeral: true });

    try {
      const [rows] = await pool.execute(
        `SELECT id, weapon_name, category, purchase_price, sell_price
         FROM weapon_prices
         WHERE LOWER(weapon_name) = LOWER(?)
         LIMIT 1`,
        [weaponName]
      );

      if (rows.length === 0) {
        await interaction.editReply({
          content: 'Dit wapen bestaat niet in de lijst.',
        });
        return;
      }

      if (category === null && purchasePrice === null && sellPrice === null) {
        await interaction.editReply({
          content: 'Je moet minstens één waarde invullen om te wijzigen.',
        });
        return;
      }

      const current = rows[0];
      const newCategory = category ?? current.category;
      const newPurchasePrice = purchasePrice ?? current.purchase_price;
      const newSellPrice = sellPrice ?? current.sell_price;

      await pool.execute(
        `UPDATE weapon_prices
         SET category = ?, purchase_price = ?, sell_price = ?
         WHERE id = ?`,
        [newCategory, newPurchasePrice, newSellPrice, current.id]
      );

      await refreshWeaponPrices(
        context,
        interaction.guild,
        `Wapen aangepast door ${interaction.user.tag}`
      );

      await interaction.editReply({
        content: `Wapen **${current.weapon_name}** is aangepast.`,
      });

      await sendBotLog(
        '✦ 𝑾𝒂𝒑𝒆𝒏 𝒂𝒂𝒏𝒈𝒆𝒑𝒂𝒔𝒕',
        `${interaction.user.tag} heeft een wapen aangepast.`,
        [
          { name: 'Wapen', value: current.weapon_name, inline: true },
          { name: 'Categorie', value: newCategory, inline: true },
          { name: 'Inkoopprijs', value: formatMoney(newPurchasePrice), inline: true },
          { name: 'Verkoopprijs', value: formatMoney(newSellPrice), inline: true },
        ]
      );
    } catch (error) {
      console.error('Fout bij /wpedit:', error);

      await interaction.editReply({
        content: 'Er ging iets mis bij het aanpassen van het wapen.',
      }).catch(() => null);

      await sendBotLog(
        '✦ 𝑾𝒑𝒆𝒅𝒊𝒕 𝒇𝒐𝒖𝒕',
        'Er ging iets mis bij het uitvoeren van /wpedit.',
        [{ name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false }]
      );
    }
  },
};