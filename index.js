require('dotenv').config();

const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const SonoranCADModule = require('sonorancad');

const SonoranCAD =
  (SonoranCADModule && SonoranCADModule.SonoranCAD) ||
  (SonoranCADModule && SonoranCADModule.default) ||
  SonoranCADModule;

if (typeof SonoranCAD !== 'function') {
  throw new Error('Unable to load SonoranCAD client from the "sonorancad" package.');
}

const requiredEnv = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  CAD_URL: process.env.CAD_URL,
  CAD_API_ID: process.env.CAD_API_ID,
  CAD_API_KEY: process.env.CAD_API_KEY
};

const missing = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const cadConfig = {
  url: process.env.CAD_URL,
  apiId: process.env.CAD_API_ID,
  apiKey: process.env.CAD_API_KEY
};

const cadClient = new SonoranCAD(cadConfig);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.inGuild() || message.channel?.type === ChannelType.DM) return;

  const prefix = '!lookup';
  if (!message.content.toLowerCase().startsWith(prefix)) {
    return;
  }

  const nameQuery = message.content.slice(prefix.length).trim();
  if (!nameQuery) {
    await message.reply('Please provide a name to look up. Example: `!lookup John Doe`');
    return;
  }

  await message.channel.sendTyping();

  try {
    if (typeof cadClient.lookup !== 'function') {
      throw new Error('The Sonoran CAD client does not provide a lookup function.');
    }

    const result = await cadClient.lookup('NAME', { name: nameQuery });
    const json = JSON.stringify(result, null, 2) || '{}';

    const MAX_LENGTH = 1990; // Leave room for code block fences
    let payload = json;
    if (payload.length > MAX_LENGTH) {
      payload = payload.slice(0, MAX_LENGTH - 3) + '...';
    }

    await message.reply(`\n\u200b\n\`\`\`json\n${payload}\n\`\`\``);
  } catch (error) {
    console.error('Lookup error:', error);
    const description = error?.message || 'Unknown error occurred while performing lookup.';
    await message.reply(`Failed to complete lookup: ${description}`);
  }
});

client.login(process.env.BOT_TOKEN);
