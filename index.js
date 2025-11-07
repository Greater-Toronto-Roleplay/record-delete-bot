require('dotenv').config();

const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

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

if (typeof fetch !== 'function') {
  throw new Error('Global fetch API not available. Please run on Node.js 18 or later.');
}

const cadUrl = requiredEnv.CAD_URL.trim().replace(/\/+$/, '');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

function buildLookupBody(command, args) {
  const baseBody = {
    types: [],
    plate: '',
    partial: false,
    first: '',
    last: '',
    mi: ''
  };

  if (command === '!plate') {
    const plate = args.join(' ').trim();
    if (!plate) {
      throw new Error('Please provide a plate. Example: `!plate ABC123`.');
    }

    return { ...baseBody, plate };
  }

  const [firstName, ...lastParts] = args;
  const lastName = lastParts.join(' ').trim();

  if (!firstName || !lastName) {
    throw new Error('Please provide both first and last name. Example: `!lookup John Doe`.');
  }

  return {
    ...baseBody,
    first: firstName,
    last: lastName
  };
}

async function performLookup(body) {
  const response = await fetch(`${cadUrl}/emergency/lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-ID': requiredEnv.CAD_API_ID,
      'X-API-KEY': requiredEnv.CAD_API_KEY
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Lookup failed with status ${response.status}: ${raw || response.statusText}`);
  }

  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch (parseError) {
    return raw || '{}';
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.inGuild() || message.channel?.type === ChannelType.DM) return;

  const content = message.content.trim();
  const lowered = content.toLowerCase();

  const commands = ['!lookup', '!plate'];
  const command = commands.find(
    (cmd) => lowered === cmd || lowered.startsWith(`${cmd} `)
  );

  if (!command) {
    return;
  }

  const args = content.slice(command.length).trim().split(/\s+/).filter(Boolean);

  await message.channel.sendTyping();

  try {
    const requestBody = buildLookupBody(command, args);
    let formatted = await performLookup(requestBody);

    const MAX_LENGTH = 1990; // Leave room for code block fencing
    if (formatted.length > MAX_LENGTH) {
      formatted = `${formatted.slice(0, MAX_LENGTH - 3)}...`;
    }

    await message.reply(`\`\`\`json\n${formatted}\n\`\`\``);
  } catch (error) {
    console.error('Lookup error:', error);
    const description = error?.message || 'Unknown error occurred while performing lookup.';
    await message.reply(description);
  }
});

client.login(requiredEnv.BOT_TOKEN);
