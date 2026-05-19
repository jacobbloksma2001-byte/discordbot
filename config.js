module.exports = {
  TOKEN: process.env.DISCORD_BOT_TOKEN || process.env.TOKEN,
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID,
  GUILD_ID: process.env.DISCORD_GUILD_ID || process.env.GUILD_ID,

  DB_HOST: process.env.DB_HOST,
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,

  SERVER_NAME: '𝙑𝙮𝙧𝙠𝙖𝙯𝙤𝒛 | 𝙈𝙍𝙋',

  WELCOME_CHANNEL_ID: '1501708362532913194',
  RP_MOMENTEN_CHANNEL_ID: '1501708362532913196',
  TICKET_CHANNEL_ID: '1501708362532913197',
  LINKING_CHANNEL_ID: '1501708362532913198',
  PORTO_CHANNEL_ID: '1501708362851684447',
  AUTO_ROLE_ID: '1501708361975070960',
  HIRED_LOG_CHANNEL_ID: '1501708362851684448',
  PROMOTE_LOG_CHANNEL_ID: '1501708362851684450',
  STARTER_ROLE_1_ID: '1501708361987522682',
  STARTER_ROLE_2_ID: '1501708361987522683',
  SUGGESTION_CHANNEL_ID: '1501708363409653929',
  SUGGESTION_LOG_CHANNEL_ID: '1503361976787533847',
  MODERATION_LOG_CHANNEL_ID: '1503360548522426450',
  RULES_CHANNEL_ID: '1501708362851684444',
  WARNING_CHANNEL_ID: '1501708362851684451',
  WEAPON_PRICE_CHANNEL_ID: '1501708363103211672',
    
 STRIKE_ROLE_ID: '1501708361966817379',
 STRIKE_KEEP_ROLE_ID: '1501708361975070960',
STRIKE_CHANNEL_ID: '1501708362851684449',
    
AFWEZIGHEID_SETTINGS: {
  PUBLIC_CHANNEL_ID: '1501708363409653928',
  OVERVIEW_CHANNEL_ID: '1504562319857025174',
  LOG_CHANNEL_ID: '1503198584072441946',
  AFWEZIG_ROLE_ID: '1504603623353483445',
  CHECK_INTERVAL_MS: 60 * 1000,
  REMINDER_BEFORE_END_MS: 60 * 60 * 1000,
  NICKNAME_PREFIX: '[AFW]',
  PUBLIC_MESSAGE_MARKER: 'vyrkazoz-afwezigheid-public',
  OVERVIEW_MESSAGE_MARKER: 'vyrkazoz-afwezigheid-overview',
},



ACTIVITY_SETTINGS: {
  PANEL_CHANNEL_ID: '1504980366409076867',
  STAFF_CHANNEL_ID: '1501708364537925779',
  LOG_CHANNEL_ID: '1503198584072441946',
  MINIMUM_ROLE_ID: '1501708361987522682',
  KADER_ROLE_ID: '1501708361975070956',
  SEMI_KADER_ROLE_ID: '1501708361975070955',
  STAFF_ROLE_ID: '1498622875970703481',
  CHECK_INTERVAL_MINUTES: 30,
  CHECK_RESPONSE_MINUTES: 5,
  WEEKLY_RESET_DAY: 1,
},
    
    COMMAND_ROLE_ACCESS: {
  '1501708361987522682': ['mijnafwezigheid', 'aanwezig', 'afwezigheid', 'suggestie'],
  '1501708361975070955': ['aannemen', 'strike', 'activiteit-lid'],
  '1501708361975070956': [
    'ban', 'botstatus', 'clear', 'demote', 'embed-banner', 'embed-basic',
    'embed-luxe', 'embed-send', 'inklokpanel', 'kick', 'klassement',
    'ledenlijst', 'porto', 'promote', 'purge', 'regels-refresh',
    'reset-activiteit-iedereen', 'reset-activiteit', 'rolewipe',
    'suggestie-review', 'suggestie-stemmen', 'testautorole', 'ticket',
    'timeout', 'uitklok-lid', 'waarschuwing', 'wpadd', 'wpdelete',
    'wpedit', 'wprefresh'
  ]
},

ANTI_LINK: {
  ENABLED: true,
  BYPASS_ROLE_IDS: [
    '1501708362000371751',
    '1501708361975070956',
    '1501708361975070955',
  ],
  ALLOWED_DOMAINS: [
    'medal.tv',
    'www.medal.tv',
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'm.youtube.com',
  ],
  WHITELISTED_URLS: [
    'rankzornl.nl',
  ],
},

  GANG_ROLE_IDS: ['1501708361987522682'],

  MEMBER_LIST_CHANNEL_ID: '1501708363103211674',
  MEMBER_LIST_UPDATE_INTERVAL_MS: 1800000,

  EMBED_COLOR: 0x6B1016,
  EMBED_FOOTER: '© Vyrkazoz bot made with ❤️ by Lucas G & Milan G',
  EMBED_BANNER_URL: 'attachment://ledenlijst-banner.jpg',
    
 SERVER_STATS: {
  ENABLED: true,
  CATEGORY_NAME: '📊 Vyrkazoz Stats 📊',
  UPDATE_INTERVAL_MS: 5 * 60 * 1000,
  CHANNELS: {
    members: '『🫂』Leden : {count}',
    boostLevel: '『🚀』Boost LVL : {count}',
    tickets: '『🎟️』Tickets : {open} open | {closed} dicht',
  },
},

  LOG_CHANNELS: {
    messageEditDelete: '1501726624150720612',
    linkDelete: '1501726773715669114',
    memberJoin: '1501727027026202684',
    memberLeave: '1501727163702050826',
    memberTimeout: '1501726868162740366',
    memberBan: '1501727347806572684',
    memberKick: '1501727383252897943',
    memberUnban: '1501727507592773853',
    botLogs: '1503198584072441946',
    ticketLogs: '1504003499183313016',
    ticketTranscripts: '1501708365460541553',
    ticketReviews: '1504003499183313016',
  },

  TICKET_SETTINGS: {
    PANEL_CHANNEL_ID: '1501708362532913197',
    CATEGORY_ID: '1501708365460541552',
    KADER_ROLE_ID: '1501708361975070956',
    SEMI_KADER_ROLE_ID: '1501708361975070955',
    REMINDER_AFTER_MS: 24 * 60 * 60 * 1000,
    AUTO_CLOSE_AFTER_MS: 48 * 60 * 60 * 1000,
    CHECK_INTERVAL_MS: 5 * 60 * 1000,
    PANEL_MESSAGE_MARKER: 'vyrkazoz-ticket-panel',
    CONTROL_MESSAGE_MARKER: 'vyrkazoz-ticket-controls',
    ALLOW_CLOSE_FOR_EVERYONE: true,
  },

TICKET_CATEGORIES: [
  {
    key: 'klacht',
    label: '⛔ Klacht Melden',
    description: 'Voor het indienen van een klacht',
    channelSuffix: 'klacht',
    supportRoleIds: ['1501708361975070956'],
    questions: [
      'Tegen wie is de klacht?',
      'Wat is er gebeurd en waar?',
      'Heb je bewijs?',
    ],
  },
  {
    key: 'samenwerking',
    label: '🤝 Samenwerkingen',
    description: 'Voor samenwerkingen',
    channelSuffix: 'samenwerking',
    supportRoleIds: ['1501708361975070956'],
    questions: [
      'Naam Gang',
      'Naam eigenaar',
      'Hoelang zijn jullie al in de stad',
      'Waarom zouden we voor jullie kiezen',
      'Hoe ziet u een samenwerking voor u',
    ],
  },
  {
    key: 'overige_vragen',
    label: '❓ Overige Vragen',
    description: 'Voor overige vragen',
    channelSuffix: 'overige-vragen',
    supportRoleIds: ['1501708361975070955', '1501708361975070956'],
    questions: ['Wat is uw vraag?'],
  },
],
  RANK_ROLES: [
    { name: '👑 | 𝑩𝒐𝒔𝒔', id: '1501708362000371748' },
    { name: '👑 | 𝑼𝒏𝒅𝒆𝒓 𝑩𝒐𝒔𝒔', id: '1501708362000371747' },
    { name: '🩸 | 𝑹𝒆𝒄𝒉𝒕𝒆𝒓𝒉𝒂𝒏𝒅', id: '1501708362000371746' },
    { name: '🗡️ | 𝑳𝒊𝒏𝒌𝒆𝒓𝒉𝒂𝒏𝒅', id: '1501708362000371745' },
    { name: '🎈 | 𝑯𝒆𝒂𝒅 𝑪𝒂𝒑𝒐', id: '1501708362000371744' },
    { name: '🎈 | 𝑪𝒂𝒑𝒐', id: '1501708362000371743' },
    { name: '🎈 | 𝑱𝒖𝒏𝒊𝒐𝒓 𝑪𝒂𝒑𝒐', id: '1501708362000371742' },
    { name: '🔫 | 𝑯𝒆𝒂𝒅 𝑯𝒊𝒕𝒎𝒂𝒏', id: '1501708361987522690' },
    { name: '🔫 | 𝑯𝒊𝒕𝒎𝒂𝒏', id: '1501708361987522689' },
    { name: '🪖 | 𝑯𝒆𝒂𝒅 𝑺𝒐𝒍𝒅𝒊𝒆𝒓', id: '1501708361987522688' },
    { name: '🪖 | 𝑺𝒐𝒍𝒅𝒊𝒆𝒓', id: '1501708361987522686' },
    { name: '♟️ | 𝑴𝒆𝒎𝒃𝒆𝒓', id: '1501708361987522685' },
    { name: '⚜️ | 𝑹𝒆𝒄𝒓𝒖𝒊𝒕', id: '1501708361987522684' },
    { name: '⌛ | 𝑷𝒓𝒐𝒆𝒇𝒑𝒆𝒓𝒊𝒐𝒅𝒆', id: '1501708361987522683' },
  ],

  PROMOTABLE_RANKS: [
    { label: '⌛ | 𝑷𝒓𝒐𝒆𝒇𝒑𝒆𝒓𝒊𝒐𝒅𝒆', value: '1501708361987522683' },
    { label: '⚜️ | 𝑹𝒆𝒄𝒓𝒖𝒊𝒕', value: '1501708361987522684' },
    { label: '♟️ | 𝑴𝒆𝒎𝒃𝒆𝒓', value: '1501708361987522685' },
    { label: '🪖 | 𝑺𝒐𝒍𝒅𝒊𝒆𝒓', value: '1501708361987522686' },
    { label: '🪖 | 𝑯𝒆𝒂𝒅 𝑺𝒐𝒍𝒅𝒊𝒆𝒓', value: '1501708361987522688' },
    { label: '🔫 | 𝑯𝒊𝒕𝒎𝒂𝒏', value: '1501708361987522689' },
    { label: '🔫 | 𝑯𝒆𝒂𝒅 𝑯𝒊𝒕𝒎𝒂𝒏', value: '1501708361987522690' },
  ],

  ROLE_WIPE_PROTECTED_ROLE_IDS: [
    '1501708361975070960',
    '1501708361987522682',
    '1501708361987522683',
    '1501708361966817373',
    '1501708361966817372',
    '1501708361966817375',
    '1501708361966817376',
    '1501708361966817377',
    '1501708361966817378',
    '1501708361966817379',
    '1501708361966817380',
    '1501708361975070953',
    '1501708361975070954',
    '1501708361987522681',
    '1501708361987522687',
  ],
};