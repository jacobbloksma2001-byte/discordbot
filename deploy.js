require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

function readCommandFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...readCommandFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const commandFiles = readCommandFiles(commandsPath);

for (const filePath of commandFiles) {
  try {
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
      console.log(`✓ Command geladen: ${command.data.name}`);
    } else {
      console.warn(`[WAARSCHUWING] ${filePath} mist "data" of "execute".`);
    }
  } catch (error) {
    console.error(`[FOUT] Kon commandbestand niet laden: ${filePath}`);
    console.error(error);
  }
}

const token = config.TOKEN;
const clientId = config.CLIENT_ID;
const guildId = config.GUILD_ID;
const deployGlobally = String(process.env.DEPLOY_GLOBAL_COMMANDS || 'false').toLowerCase() === 'true';

if (!token) {
  console.error('TOKEN ontbreekt in config/.env');
  process.exit(1);
}

if (!clientId) {
  console.error('CLIENT_ID ontbreekt in config/.env');
  process.exit(1);
}

if (!deployGlobally && !guildId) {
  console.error('GUILD_ID ontbreekt in config/.env voor guild deploy.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Start met verversen van ${commands.length} application (/) commands...`);

    if (deployGlobally) {
      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );

      console.log(`✅ Succesvol ${data.length} global application (/) commands gedeployed.`);
    } else {
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );

      console.log(`✅ Succesvol ${data.length} guild application (/) commands gedeployed in guild ${guildId}.`);
    }
  } catch (error) {
    console.error('❌ Fout tijdens het deployen van commands:');
    console.error(error);
    process.exit(1);
  }
})();