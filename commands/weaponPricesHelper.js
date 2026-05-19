const WEAPON_CATEGORIES = [
  'Pistols',
  'Shotguns',
  'Submachine Guns',
  'Rifles',
  'Steekwapens',
  'Gereedschap',
];

function formatMoney(value) {
  return `€${new Intl.NumberFormat('nl-NL').format(Number(value) || 0)}`;
}

async function refreshWeaponPrices(context, guild, reason = 'Onbekende reden') {
  const { config, pool, createBaseEmbed, fetchTextChannel, sendBotLog } = context;

  if (!guild) return false;

  try {
    const channel = await fetchTextChannel(config.WEAPON_PRICE_CHANNEL_ID);
    if (!channel) {
      await sendBotLog(
        '✦ 𝑾𝒂𝒑𝒆𝒏 𝒑𝒓𝒊𝒋𝒛𝒆𝒏 𝒇𝒐𝒖𝒕',
        'Het wapenprijzen kanaal kon niet worden gevonden of is niet tekstgebaseerd.',
        [{ name: 'Reden', value: reason, inline: false }]
      );
      return false;
    }

    const [rows] = await pool.execute(
      `SELECT weapon_name, category, purchase_price, sell_price
       FROM weapon_prices
       ORDER BY
         FIELD(category, 'Pistols', 'Shotguns', 'Submachine Guns', 'Rifles', 'Steekwapens', 'Gereedschap'),
         weapon_name ASC`
    );

    const fields = [];

    for (const category of WEAPON_CATEGORIES) {
      const categoryRows = rows.filter(row => row.category === category);

      if (categoryRows.length === 0) {
        fields.push({
          name: category,
          value: 'Geen wapens in deze categorie.',
          inline: false,
        });
        continue;
      }

      let currentChunk = '';
      let firstChunk = true;

      for (const row of categoryRows) {
        const line = `• **${row.weapon_name}**\nInkoop: ${formatMoney(row.purchase_price)}\nVerkoop: ${formatMoney(row.sell_price)}`;
        const candidate = currentChunk ? `${currentChunk}\n\n${line}` : line;

        if (candidate.length > 1024) {
          fields.push({
            name: firstChunk ? category : `${category} (vervolg)`,
            value: currentChunk,
            inline: false,
          });
          currentChunk = line;
          firstChunk = false;
        } else {
          currentChunk = candidate;
        }
      }

      if (currentChunk) {
        fields.push({
          name: firstChunk ? category : `${category} (vervolg)`,
          value: currentChunk,
          inline: false,
        });
      }
    }

    const embed = createBaseEmbed({
      title: '✦ Wapenprijzen ✦',
      description: 'Hieronder vind je alle wapenprijzen, gesorteerd per categorie.',
      fields,
      image: true,
    });

    const messages = await channel.messages.fetch({ limit: 25 });
    const existingMessage = messages.find(
      msg =>
        msg.author.id === guild.members.me?.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0]?.title === '✦ Wapenprijzen ✦'
    );

    if (existingMessage) {
      await existingMessage.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }

    return true;
  } catch (error) {
    await sendBotLog(
      '✦ 𝑾𝒂𝒑𝒆𝒏 𝒑𝒓𝒊𝒋𝒛𝒆𝒏 𝒇𝒐𝒖𝒕',
      'Er ging iets mis bij het vernieuwen van de wapenprijzen embed.',
      [
        { name: 'Reden', value: reason, inline: false },
        { name: 'Fout', value: String(error.message || error).slice(0, 1024), inline: false },
      ]
    );
    return false;
  }
}

module.exports = {
  WEAPON_CATEGORIES,
  formatMoney,
  refreshWeaponPrices,
};