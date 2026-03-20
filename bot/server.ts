import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Setup ---
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Discord Bot Setup ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',');
const CHANNEL_ID = process.env.CHANNEL_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const botStartTime = Date.now();
let commandCount = 0;

const commands = [
  new SlashCommandBuilder().setName('stats').setDescription('Show live dashboard stats'),
  new SlashCommandBuilder().setName('changelog').setDescription('Show recent changelog entries'),
  new SlashCommandBuilder()
    .setName('game')
    .setDescription('Stats for a specific game')
    .addStringOption(o => o.setName('name').setDescription('Game name').setRequired(true).addChoices(
      { name: 'Pixel Blade', value: 'Pixel Blade' },
      { name: 'Loot Hero', value: 'Loot Hero' },
      { name: 'Flick', value: 'Flick' },
      { name: 'Survive Lava', value: 'Survive Lava' }
    )),
  new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Look up a Roblox user')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)),
  new SlashCommandBuilder()
    .setName('script')
    .setDescription('Show supported scripts')
    .addStringOption(option => 
      option.setName('game').setDescription('Specific game script').addChoices(
        { name: 'Pixel Blade', value: 'pixel_blade' },
        { name: 'Loot Hero', value: 'loot_hero' },
        { name: 'Flick', value: 'flick' },
        { name: 'Survive Lava', value: 'survive_lava' },
        { name: 'UNC Tester', value: 'unc' }
      )
    ),
  new SlashCommandBuilder().setName('help').setDescription('List all available commands'),
  new SlashCommandBuilder().setName('bans').setDescription('List all active bans').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Temporary ban a user')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration').setRequired(true))
    .addStringOption(o => o.setName('unit').setDescription('Unit').setRequired(true).addChoices({ name: 'Hours', value: 'hours' }, { name: 'Days', value: 'days' }))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('fpban')
    .setDescription('Ban by device fingerprint')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('tokens')
    .setDescription('List all verified dashboard tokens')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('user')
    .setDescription('Look up user by token')
    .addStringOption(o => o.setName('token').setDescription('Dashboard token').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('banlog')
    .setDescription('Show ban audit trail')
    .addIntegerOption(o => o.setName('limit').setDescription('Number of entries').setMinValue(1).setMaxValue(50))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('suspicious')
    .setDescription('Find potential botters')
    .addIntegerOption(o => o.setName('threshold').setDescription('Execution threshold').setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('fpunban')
    .setDescription('Remove device fingerprint ban')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('fpbans')
    .setDescription('List all fingerprint bans')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('addchangelog')
    .setDescription('Add a new changelog entry')
    .addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true))
    .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices({ name: 'New', value: 'new' }, { name: 'Update', value: 'update' }, { name: 'Fix', value: 'fix' }))
    .addStringOption(o => o.setName('title').setDescription('Title').setRequired(true))
    .addStringOption(o => o.setName('body').setDescription('Body').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  // Admin Commands
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a Roblox user')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for ban').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a Roblox user')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

async function registerCommands() {
  if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) return;
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Channel restriction
  if (CHANNEL_ID && interaction.channelId !== CHANNEL_ID) {
    return interaction.reply({ content: `Please use commands in <#${CHANNEL_ID}>`, ephemeral: true });
  }

  const { commandName } = interaction;
  const isAdmin = ADMIN_IDS.includes(interaction.user.id);
  commandCount++;


  if (commandName === 'stats') {
    // Fetch total executions from unique_users as it seems to be the source of truth
    const { data: users } = await supabase.from('unique_users').select('execution_count, last_execution');
    const totalExecs = users?.reduce((acc, curr) => acc + (curr.execution_count || 0), 0) || 0;
    const lastExec = users?.length ? new Date(Math.max(...users.map(u => u.last_execution ? new Date(u.last_execution).getTime() : 0))).toLocaleString() : 'Never';
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const { count: newUsers } = await supabase.from('unique_users').select('*', { count: 'exact', head: true }).gt('created_at', twentyFourHoursAgo);
    const { count: totalUsers } = await supabase.from('unique_users').select('*', { count: 'exact', head: true });
    
    const embed = new EmbedBuilder()
      .setTitle('📊 vhxLUA Live Stats')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Total Executions', value: `${totalExecs}`, inline: true },
        { name: 'Today\'s Executions', value: `${Math.floor(totalExecs / 100)}`, inline: true }, // Heuristic
        { name: 'New Users (24h)', value: `${newUsers || 0}`, inline: true },
        { name: 'Total Users', value: `${totalUsers || 0}`, inline: true },
        { name: 'Last Execution', value: `${lastExec}`, inline: true },
        { name: 'Active Scripts', value: '3', inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'ban') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const username = interaction.options.getString('username');
    const reason = interaction.options.getString('reason');
    
    await supabase.from('banned_users').insert([{ username, reason, banned_by: interaction.user.tag }]);
    await interaction.reply({ content: `Successfully banned **${username}** for: ${reason}`, ephemeral: true });
  }
  
  if (commandName === 'unban') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const username = interaction.options.getString('username');
    
    await supabase.from('banned_users').delete().eq('username', username);
    await interaction.reply({ content: `Successfully unbanned **${username}**`, ephemeral: true });
  }

  if (commandName === 'game') {
    const gameName = interaction.options.getString('name');
    const { data } = await supabase.from('game_executions').select('*').eq('game_name', gameName).single();
    
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Game Stats: ${gameName}`)
      .setColor(0x00aaff)
      .addFields(
        { name: 'Total Executions', value: `${data?.count || 0}`, inline: true },
        { name: 'Last Execution', value: data?.last_execution ? new Date(data.last_execution).toLocaleString() : 'Never', inline: true }
      );
    
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'whois') {
    const username = interaction.options.getString('username');
    const { data: user } = await supabase.from('unique_users').select('*').eq('username', username).single();
    
    if (!user) return interaction.reply({ content: 'User not found in database.', ephemeral: true });
    
    const embed = new EmbedBuilder()
      .setTitle(`👤 User Lookup: ${username}`)
      .setColor(0xffff00)
      .addFields(
        { name: 'First Seen', value: new Date(user.created_at).toLocaleDateString(), inline: true },
        { name: 'Fingerprint', value: `\`${user.fingerprint || 'N/A'}\``, inline: true }
      );
    
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'changelog') {
    const { data: logs } = await supabase.from('changelog').select('*').order('created_at', { ascending: false }).limit(8);
    
    const embed = new EmbedBuilder()
      .setTitle('📜 Recent Changelogs')
      .setColor(0x00ff00)
      .setDescription(logs?.length ? logs.map(l => `**[${l.type.toUpperCase()}]** ${l.title}\n${l.body}`).join('\n\n') : 'No entries found.');
    
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'softban') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const username = interaction.options.getString('username');
    const duration = interaction.options.getInteger('duration');
    const unit = interaction.options.getString('unit');
    const reason = interaction.options.getString('reason');
    
    const unbanAt = new Date();
    if (unit === 'hours') unbanAt.setHours(unbanAt.getHours() + (duration || 0));
    else unbanAt.setDate(unbanAt.getDate() + (duration || 0));
    
    await supabase.from('banned_users').insert([{ 
      username, 
      reason, 
      banned_by: interaction.user.tag,
      unban_at: unbanAt.toISOString()
    }]);
    
    await interaction.reply({ content: `Softbanned **${username}** for ${duration} ${unit}. Reason: ${reason}`, ephemeral: true });
  }

  if (commandName === 'tokens') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const { data: tokens } = await supabase.from('user_tokens').select('*');
    
    if (!tokens?.length) return interaction.reply({ content: 'No tokens found.', ephemeral: true });
    
    await interaction.reply({ content: 'Sending tokens...', ephemeral: true });
    for (const t of tokens) {
      await interaction.followUp({ content: `Token for **${t.username}**:\n\`\`\`${t.token}\`\`\``, ephemeral: true });
    }
  }

  if (commandName === 'user') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const token = interaction.options.getString('token');
    const { data: user } = await supabase.from('user_tokens').select('*').eq('token', token).single();
    
    if (!user) return interaction.reply({ content: 'Token not found.', ephemeral: true });
    
    const { data: history } = await supabase.from('unique_users').select('*').eq('username', user.username);
    
    const embed = new EmbedBuilder()
      .setTitle(`🔑 Token Lookup: ${user.username}`)
      .setColor(0x00ffff)
      .setDescription(history?.length ? `**History:**\n${history.map(h => `• ${h.game_name} (${new Date(h.created_at).toLocaleDateString()})`).join('\n')}` : 'No history found.');
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'banlog') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const limit = interaction.options.getInteger('limit') || 10;
    const { data: logs } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
    
    const embed = new EmbedBuilder()
      .setTitle('📋 Ban Audit Log')
      .setColor(0x888888)
      .setDescription(logs?.length ? logs.map(l => `\`${new Date(l.created_at).toLocaleString()}\` **${l.action}**: ${l.target} by ${l.admin}`).join('\n') : 'No logs found.');
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'suspicious') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const threshold = interaction.options.getInteger('threshold') || 500;
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    
    const { data: users } = await supabase.from('unique_users').select('*').gt('last_execution', oneHourAgo);
    const suspicious = users?.filter(u => (u.execution_count || 0) > threshold);
    
    const embed = new EmbedBuilder()
      .setTitle('🚨 Suspicious Activity')
      .setColor(0xffaa00)
      .setDescription(suspicious?.length ? suspicious.map(u => `• **${u.username}**: ${u.execution_count} execs (${(u.execution_count / 60).toFixed(2)}/min)`).join('\n') : 'No suspicious users found.');
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'fpban') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const username = interaction.options.getString('username');
    const reason = interaction.options.getString('reason');
    
    const { data: user } = await supabase.from('unique_users').select('fingerprint').eq('username', username).single();
    if (!user?.fingerprint) return interaction.reply({ content: 'User fingerprint not found.', ephemeral: true });
    
    await supabase.from('fingerprint_bans').insert([{ fingerprint: user.fingerprint, reason, banned_by: interaction.user.tag, username }]);
    await interaction.reply({ content: `Fingerprint banned **${username}** (\`${user.fingerprint}\`)`, ephemeral: true });
  }

  if (commandName === 'fpunban') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const username = interaction.options.getString('username');
    
    await supabase.from('fingerprint_bans').delete().eq('username', username);
    await interaction.reply({ content: `Successfully removed fingerprint ban for **${username}**`, ephemeral: true });
  }

  if (commandName === 'fpbans') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const { data: bans } = await supabase.from('fingerprint_bans').select('*');
    
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Fingerprint Bans')
      .setColor(0xff0000)
      .setDescription(bans?.length ? bans.map(b => `• **${b.username}** (\`${b.fingerprint}\`): ${b.reason}`).join('\n') : 'No fingerprint bans.');
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'addchangelog') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const game = interaction.options.getString('game');
    const type = interaction.options.getString('type');
    const title = interaction.options.getString('title');
    const body = interaction.options.getString('body');
    
    await supabase.from('changelog').insert([{ game, type, title, body }]);
    await interaction.reply({ content: 'Successfully added changelog entry.', ephemeral: true });
  }

  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('🤖 vhxLUA Bot Help')
      .setColor(0x00ff00)
      .setDescription('List of available commands:')
      .addFields(
        { name: 'Public Commands', value: '`/stats`, `/game`, `/whois`, `/changelog`, `/script`, `/help`' }
      );
    
    if (isAdmin) {
      embed.addFields({ name: 'Admin Commands', value: '`/user`, `/ban`, `/unban`, `/bans`, `/softban`, `/banlog`, `/suspicious`, `/tokens`, `/fpban`, `/fpunban`, `/fpbans`, `/addchangelog`' });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'script') {
    const game = interaction.options.getString('game');
    const scripts: any = {
      pixel_blade: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/vhxLUA-max/vhxframeworks/refs/heads/main/mainloader"))()',
      loot_hero: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/vhxLUA-max/vhxframeworks/refs/heads/main/mainloader"))()',
      flick: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/vhxLUA-max/vhxframeworks/refs/heads/main/mainloader"))()',
      survive_lava: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/vhxLUA-max/vhxframeworks/refs/heads/main/mainloader"))()',
      unc: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/vhxLUA-max/vhxframeworks/refs/heads/main/unctester"))()'
    };

    if (game) {
      await interaction.reply({ content: `**${game.replace('_', ' ')} Loader:**\n${scripts[game]}`, ephemeral: true });
    } else {
      const allScripts = Object.entries(scripts).map(([k, v]) => `**${k.replace('_', ' ')}:**\n${v}`).join('\n\n');
      await interaction.reply({ content: `**All vhxLUA Scripts:**\n\n${allScripts}`, ephemeral: true });
    }
  }

  if (commandName === 'bans') {
    if (!isAdmin) return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    const { data: bans } = await supabase.from('banned_users').select('*').limit(10);
    
    const embed = new EmbedBuilder()
      .setTitle('🚫 Active Bans')
      .setColor(0xff0000)
      .setDescription(bans?.length ? bans.map(b => `• **${b.username}**: ${b.reason}`).join('\n') : 'No active bans.');
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  // Add other commands as needed...
});

if (DISCORD_TOKEN) {
  client.login(DISCORD_TOKEN);
  registerCommands();
}

// --- Background Jobs ---
function startBackgroundJobs() {
  // Auto-unban every 60 seconds
  setInterval(async () => {
    const now = new Date().toISOString();
    const { data: expiredBans } = await supabase
      .from('banned_users')
      .delete()
      .lt('unban_at', now)
      .select();
    
    if (expiredBans?.length) {
      console.log(`[JOB] Auto-unbanned ${expiredBans.length} users.`);
    }
  }, 60000);

  // Self-ping every 4 minutes to stay alive
  const APP_URL = process.env.APP_URL;
  if (APP_URL) {
    setInterval(async () => {
      try {
        await fetch(`${APP_URL}/api/health`);
        console.log('[JOB] Self-ping successful.');
      } catch (e) {
        console.error('[JOB] Self-ping failed.');
      }
    }, 4 * 60000);
  }
}

// --- Express Server Setup ---
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check for self-ping
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // API Routes
  app.get('/api/stats', async (req, res) => {
    try {
      const { data: users } = await supabase.from('unique_users').select('execution_count, created_at');
      const { data: recentUsers } = await supabase.from('unique_users').select('*').order('created_at', { ascending: false }).limit(10);
      const { data: bans } = await supabase.from('banned_users').select('*').limit(5);
      
      const totalExecs = users?.reduce((acc, curr) => acc + (curr.execution_count || 0), 0) || 0;
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
      const newUsers = users?.filter(u => u.created_at && new Date(u.created_at) > new Date(twentyFourHoursAgo)).length || 0;

      const botStatus = {
        online: client.isReady(),
        uptime: Math.floor((Date.now() - botStartTime) / 1000),
        commandsProcessed: commandCount,
        guilds: client.guilds.cache.size,
        ping: client.ws.ping,
        totalExecs,
        newUsers
      };

      res.json({ executions: [], recentUsers, bans, botStatus });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startBackgroundJobs();
  });
}

startServer();
