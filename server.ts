import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import morgan from 'morgan';
import { createClient } from '@supabase/supabase-js';
import {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
} from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, initLogger, getBuffer } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL   = process.env.SUPABASE_URL || '';
const SUPABASE_KEY   = process.env.SUPABASE_KEY || '';
const supabase       = createClient(SUPABASE_URL, SUPABASE_KEY);

const DISCORD_TOKEN_MAIN    = process.env.DISCORD_TOKEN_MAIN || '';
const DISCORD_TOKEN_COUNTER = process.env.DISCORD_TOKEN_COUNTER || '';
const CLIENT_ID      = process.env.CLIENT_ID || '';
const GUILD_ID       = process.env.GUILD_ID || '';
const ADMIN_IDS      = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim());
const CHANNEL_ID     = process.env.CHANNEL_ID || '';
const COUNTER_CHANNEL_ID = process.env.COUNTER_CHANNEL_ID || '';
const APP_URL        = process.env.APP_URL || '';

const isAdmin = (id: string) => ADMIN_IDS.includes(id);

const logs: { time: string; level: string; msg: string }[] = [];
const log = (level: 'INFO' | 'WARN' | 'ERROR', msg: string, type = 'system') => {
  const entry = { time: new Date().toISOString(), level, msg };
  logs.unshift(entry);
  if (logs.length > 500) logs.pop();
  if (level === 'ERROR') logger.error('system', msg);
  else if (level === 'WARN') logger.warn('system', msg);
  else logger.info('system', msg);
  supabase.from('console_logs').insert({ level, msg, type }).then(() => {}).catch(() => {});
};

// ── MAIN BOT ─────────────────────────────────────────────────────────────────
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
const mainStart  = Date.now();
let mainOnline   = false;
let commandCount = 0;

const PLACE_NAMES: Record<number, string> = {
  18172550962: 'Pixel Blade', 18172553902: 'Pixel Blade',
  133884972346775: 'Pixel Blade', 138013005633222: 'Loot Hero',
  77439980360504: 'Loot Hero', 119987266683883: 'Survive Lava',
  136801880565837: 'Flick', 123974602339071: 'UNC Tester',
};
const gName = (r: any) => r.game_name || PLACE_NAMES[r.place_id] || `Place ${r.place_id}`;

const LOADER = 'loadstring(game:HttpGet("https://raw.githubusercontent.com/vhxLUA-max/vhxframeworks/refs/heads/main/mainloader"))()';
const SCRIPTS: Record<string, string> = {
  pixel_blade: LOADER, loot_hero: LOADER, flick: LOADER, survive_lava: LOADER,
  unc: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/vhxLUA-max/vhxframeworks/refs/heads/main/unctester"))()',
};

const timeAgo = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};
const fmt = (n: number) => n.toLocaleString();

const commands = [
  new SlashCommandBuilder().setName('stats').setDescription('Live dashboard stats'),
  new SlashCommandBuilder().setName('changelog').setDescription('Recent changelog entries'),
  new SlashCommandBuilder().setName('game').setDescription('Stats for a specific game')
    .addStringOption(o => o.setName('name').setDescription('Game name').setRequired(true)
      .addChoices({ name: 'Pixel Blade', value: 'Pixel Blade' }, { name: 'Loot Hero', value: 'Loot Hero' }, { name: 'Flick', value: 'Flick' }, { name: 'Survive Lava', value: 'Survive Lava' })),
  new SlashCommandBuilder().setName('whois').setDescription('Look up a Roblox user')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)),
  new SlashCommandBuilder().setName('script').setDescription('Show supported scripts')
    .addStringOption(o => o.setName('game').setDescription('Specific game').addChoices(
      { name: 'Pixel Blade', value: 'pixel_blade' }, { name: 'Loot Hero', value: 'loot_hero' },
      { name: 'Flick', value: 'flick' }, { name: 'Survive Lava', value: 'survive_lava' }, { name: 'UNC Tester', value: 'unc' }
    )),
  new SlashCommandBuilder().setName('help').setDescription('List all commands'),
  new SlashCommandBuilder().setName('bans').setDescription('List active bans').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user').addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user').addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('softban').setDescription('Temp ban a user').addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Duration').setRequired(true)).addStringOption(o => o.setName('unit').setDescription('Unit').setRequired(true).addChoices({ name: 'Hours', value: 'hours' }, { name: 'Days', value: 'days' })).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('fpban').setDescription('Ban by device fingerprint').addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('fpunban').setDescription('Remove fingerprint ban').addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('fpbans').setDescription('List fingerprint bans').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('hwidban').setDescription('Ban by HWID').addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('hwidunban').setDescription('Remove HWID ban').addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('hwidbans').setDescription('List HWID bans').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('vpnflags').setDescription('List VPN/proxy flagged users').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('tokens').setDescription('List verified tokens').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('user').setDescription('Look up user by token').addStringOption(o => o.setName('token').setDescription('Dashboard token').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('banlog').setDescription('Ban audit trail').addIntegerOption(o => o.setName('limit').setDescription('Number of entries').setMinValue(1).setMaxValue(50)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('suspicious').setDescription('Find potential botters').addIntegerOption(o => o.setName('threshold').setDescription('Threshold').setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('addchangelog').setDescription('Add changelog entry').addStringOption(o => o.setName('game').setDescription('Game').setRequired(true)).addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices({ name: 'New', value: 'new' }, { name: 'Update', value: 'update' }, { name: 'Fix', value: 'fix' })).addStringOption(o => o.setName('title').setDescription('Title').setRequired(true)).addStringOption(o => o.setName('body').setDescription('Body').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('maintenance').setDescription('Toggle maintenance mode for a game').addStringOption(o => o.setName('game').setDescription('Game name').setRequired(true).addChoices({ name: 'Pixel Blade', value: 'Pixel Blade' }, { name: 'Loot Hero', value: 'Loot Hero' }, { name: 'Flick', value: 'Flick' }, { name: 'Survive Lava', value: 'Survive Lava' }, { name: 'UNC Tester', value: 'UNC Tester' })).addStringOption(o => o.setName('action').setDescription('Enable or disable').setRequired(true).addChoices({ name: 'Enable maintenance', value: 'off' }, { name: 'Disable maintenance (go live)', value: 'on' })).addStringOption(o => o.setName('message').setDescription('Maintenance message').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('gamestatus').setDescription('Show maintenance status of all games').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

async function registerCommands() {
  if (!DISCORD_TOKEN_MAIN || !CLIENT_ID || !GUILD_ID) return;
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  log('INFO', 'Slash commands registered');
}

bot.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (CHANNEL_ID && interaction.channelId !== CHANNEL_ID)
    return interaction.reply({ content: `Commands only work in <#${CHANNEL_ID}>`, ephemeral: true });

  const { commandName } = interaction;
  const admin = isAdmin(interaction.user.id);
  commandCount++;
  log('INFO', `/${commandName} used by ${interaction.user.tag}`);

  if (commandName === 'stats') {
    await interaction.deferReply();
    const today   = new Date().toISOString().slice(0, 10);
    const since24 = new Date(Date.now() - 86400000).toISOString();
    const [{ data: execs }, { data: activeU }, { data: newU }, { count: totalU }] = await Promise.all([
      supabase.from('game_executions').select('count,daily_count,daily_reset_at,last_executed_at').order('last_executed_at', { ascending: false }),
      supabase.from('unique_users').select('roblox_user_id').gte('last_seen', since24),
      supabase.from('unique_users').select('roblox_user_id').gte('first_seen', since24),
      supabase.from('unique_users').select('*', { count: 'exact', head: true }),
    ]);
    const total   = (execs ?? []).reduce((s: number, e: any) => s + (e.count ?? 0), 0);
    const todayEx = (execs ?? []).reduce((s: number, e: any) => s + (e.daily_reset_at?.slice(0,10) === today ? (e.daily_count ?? 0) : 0), 0);
    const lastEx  = (execs as any[])?.[0]?.last_executed_at;
    const activeC = new Set((activeU ?? []).map((u: any) => u.roblox_user_id)).size;
    const newC    = new Set((newU ?? []).map((u: any) => u.roblox_user_id)).size;
    const embed = new EmbedBuilder().setTitle('📊 vhxLUA Live Stats').setColor(0x6366f1).setDescription([
      `> ⚡ **Total Executions** — \`${fmt(total)}\``,
      `> 📅 **Today** — \`${fmt(todayEx)}\``,
      `> 👥 **Active Users (24h)** — \`${fmt(activeC)}\``,
      `> 🆕 **New Users (24h)** — \`${fmt(newC)}\``,
      `> 👤 **Total Users** — \`${fmt(totalU ?? 0)}\``,
      `> 🕒 **Last Execution** — \`${lastEx ? timeAgo(lastEx) : 'Never'}\``,
      `> 🎮 **Active Scripts** — \`3\``,
    ].join('\n')).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'game') {
    await interaction.deferReply();
    const name = interaction.options.getString('name')!;
    const { data } = await supabase.from('game_executions').select('*').eq('game_name', name).single();
    const embed = new EmbedBuilder().setTitle(`🎮 ${name}`).setColor(0x6366f1).setDescription([
      `> ⚡ **Total Executions** — \`${fmt(data?.count ?? 0)}\``,
      `> 🕒 **Last Execution** — \`${data?.last_executed_at ? timeAgo(data.last_executed_at) : 'Never'}\``,
    ].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'whois') {
    await interaction.deferReply();
    const username = interaction.options.getString('username')!;
    const { data: rows } = await supabase.from('unique_users').select('*').ilike('username', username);
    if (!rows?.length) return interaction.editReply({ content: '❌ User not found.' });
    const total   = rows.reduce((s: number, r: any) => s + (r.execution_count ?? 0), 0);
    const earliest = rows.reduce((a: any, b: any) => new Date(a.first_seen) < new Date(b.first_seen) ? a : b).first_seen;
    const latest   = rows.reduce((a: any, b: any) => new Date(a.last_seen) > new Date(b.last_seen) ? a : b).last_seen;
    const games    = rows.sort((a: any, b: any) => b.execution_count - a.execution_count).map((r: any) => `> 🎮 **${gName(r)}** — \`${fmt(r.execution_count)} execs\``).join('\n');
    const embed = new EmbedBuilder().setTitle(`👤 ${rows[0].username}`).setColor(0x6366f1).setURL(`https://www.roblox.com/users/${rows[0].roblox_user_id}/profile`).setDescription([
      `> ⚡ **Total Executions** — \`${fmt(total)}\``,
      `> 🎮 **Games Played** — \`${rows.length}\``,
      `> 📅 **First Seen** — \`${timeAgo(earliest)}\``,
      `> 🕒 **Last Seen** — \`${timeAgo(latest)}\``,
      `\n**Game Breakdown**\n${games || '> —'}`,
    ].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'changelog') {
    await interaction.deferReply();
    const { data } = await supabase.from('changelog').select('*').order('date', { ascending: false }).limit(8);
    const TYPE_EMOJI: Record<string, string> = { new: '🟢', update: '🔵', fix: '🔴' };
    const embed = new EmbedBuilder().setTitle('📋 Changelog').setColor(0x6366f1)
      .setDescription(data?.length ? data.map((e: any) => `> ${TYPE_EMOJI[e.type] ?? '⚪'} **[${e.game}] ${e.title}**${e.body ? ` — ${e.body}` : ''} \`${e.date}\``).join('\n') : 'No entries yet.');
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'script') {
    await interaction.deferReply({ ephemeral: true });
    const game = interaction.options.getString('game');
    if (game) {
      const embed = new EmbedBuilder().setTitle(`📜 ${game.replace('_', ' ')}`).setColor(0x6366f1).setDescription(`> 🔗 **Loader**`);
      await interaction.editReply({ embeds: [embed] });
      await interaction.followUp({ content: `\`\`\`lua\n${SCRIPTS[game]}\n\`\`\``, ephemeral: true });
    } else {
      const embed = new EmbedBuilder().setTitle('📜 vhxLUA Scripts').setColor(0x6366f1)
        .setDescription(Object.keys(SCRIPTS).map(k => `> 🎮 **${k.replace('_', ' ')}**`).join('\n'))
        .setFooter({ text: 'Use /script [game] for a specific loader' });
      await interaction.editReply({ embeds: [embed] });
      for (const [k, v] of Object.entries(SCRIPTS))
        await interaction.followUp({ content: `**${k.replace('_', ' ')}:**\n\`\`\`lua\n${v}\n\`\`\``, ephemeral: true });
    }
  }

  if (commandName === 'help') {
    const embed = new EmbedBuilder().setTitle('🤖 vhxLUA Bot Help').setColor(0x6366f1)
      .addFields({ name: '📊 Public', value: '`/stats` `/game` `/whois` `/changelog` `/script` `/help`' });
    if (admin) embed.addFields({ name: '🔒 Admin', value: '`/user` `/ban` `/unban` `/bans` `/softban` `/banlog` `/suspicious` `/tokens` `/fpban` `/fpunban` `/fpbans` `/addchangelog`' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'ban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    const reason   = interaction.options.getString('reason')!;
    const { data: rows } = await supabase.from('unique_users').select('roblox_user_id,username').ilike('username', username).limit(1);
    const user = rows?.[0];
    if (!user) return interaction.editReply({ content: `❌ **${username}** not found.` });
    await supabase.from('banned_users').insert({ roblox_user_id: user.roblox_user_id, username: user.username, reason });
    log('INFO', `@${user.username} banned — ${reason}`, 'ban');
    const embed = new EmbedBuilder().setTitle('🔨 User Banned').setColor(0xef4444).setDescription([`> 👤 **User** — @${user.username}`, `> 📋 **Reason** — ${reason}`, `> 🛡️ **By** — <@${interaction.user.id}>`].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'unban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    await supabase.from('banned_users').delete().ilike('username', username);
    log('INFO', `@${username} unbanned`, 'unban');
    await interaction.editReply({ content: `✅ **@${username}** unbanned.` });
  }

  if (commandName === 'bans') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const { data } = await supabase.from('banned_users').select('*').order('created_at', { ascending: false });
    const embed = new EmbedBuilder().setTitle(`🚫 Banned Users (${data?.length ?? 0})`).setColor(0xef4444)
      .setDescription(data?.length ? data.slice(0,20).map((b: any) => `> 🚫 **@${b.username}** — \`${b.reason ?? 'No reason'}\` *(${timeAgo(b.created_at)})*`).join('\n') : 'No banned users.');
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'softban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    const duration = interaction.options.getInteger('duration')!;
    const unit     = interaction.options.getString('unit')!;
    const reason   = interaction.options.getString('reason')!;
    const ms       = duration * (unit === 'hours' ? 3600000 : 86400000);
    const unbanAt  = new Date(Date.now() + ms).toISOString();
    const { data: rows } = await supabase.from('unique_users').select('roblox_user_id,username').ilike('username', username).limit(1);
    const user = rows?.[0];
    if (!user) return interaction.editReply({ content: `❌ **${username}** not found.` });
    await supabase.from('banned_users').insert({ roblox_user_id: user.roblox_user_id, username: user.username, reason: `[SOFTBAN until ${new Date(unbanAt).toUTCString()}] ${reason}`, unban_at: unbanAt });
    log('INFO', `@${user.username} softbanned for ${duration} ${unit} — ${reason}`, 'ban');
    const embed = new EmbedBuilder().setTitle('⏱️ Softban Applied').setColor(0xf59e0b).setDescription([`> 👤 **User** — @${user.username}`, `> ⏳ **Duration** — \`${duration} ${unit}\``, `> 📅 **Unbans At** — \`${new Date(unbanAt).toUTCString()}\``, `> 📋 **Reason** — ${reason}`].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'tokens') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const { data } = await supabase.from('user_tokens').select('*').order('updated_at', { ascending: false });
    if (!data?.length) return interaction.editReply({ content: 'No tokens found.' });
    const embed = new EmbedBuilder().setTitle(`🔑 Verified Tokens (${data.length})`).setColor(0x6366f1)
      .setDescription(data.slice(0,20).map((t: any) => `> **@${t.roblox_username}** *(${timeAgo(t.updated_at)})*`).join('\n'));
    await interaction.editReply({ embeds: [embed] });
    for (const t of data.slice(0, 20))
      await interaction.followUp({ content: `**@${t.roblox_username}:**\n\`\`\`${t.token}\`\`\``, ephemeral: true });
  }

  if (commandName === 'user') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const token = interaction.options.getString('token')!.toUpperCase();
    const { data: tokenRow } = await supabase.from('user_tokens').select('roblox_user_id,roblox_username').eq('token', token).maybeSingle();
    if (!tokenRow) return interaction.editReply({ content: '❌ Token not found.' });
    const { data: rows } = await supabase.from('unique_users').select('*').eq('roblox_user_id', tokenRow.roblox_user_id);
    if (!rows?.length) return interaction.editReply({ content: '❌ No execution data found.' });
    const total   = rows.reduce((s: number, r: any) => s + (r.execution_count ?? 0), 0);
    const earliest = rows.reduce((a: any, b: any) => new Date(a.first_seen) < new Date(b.first_seen) ? a : b).first_seen;
    const latest   = rows.reduce((a: any, b: any) => new Date(a.last_seen) > new Date(b.last_seen) ? a : b).last_seen;
    const games    = rows.sort((a: any, b: any) => b.execution_count - a.execution_count).map((r: any) => `> 🎮 **${gName(r)}** — \`${fmt(r.execution_count)} execs\``).join('\n');
    const embed = new EmbedBuilder().setTitle(`👤 ${tokenRow.roblox_username}`).setColor(0x6366f1).setURL(`https://www.roblox.com/users/${tokenRow.roblox_user_id}/profile`).setDescription([
      `> ⚡ **Total** — \`${fmt(total)}\``, `> 📅 **First Seen** — \`${timeAgo(earliest)}\``, `> 🕒 **Last Seen** — \`${timeAgo(latest)}\``,
      `\n**Game Breakdown**\n${games || '> —'}`,
    ].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'banlog') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const limit = interaction.options.getInteger('limit') ?? 10;
    const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
    const EMOJI: Record<string, string> = { ban_user: '🔨', unban_user: '✅', softban: '⏱️', fpban: '🔒' };
    const embed = new EmbedBuilder().setTitle(`📋 Ban Log (last ${data?.length ?? 0})`).setColor(0x6366f1)
      .setDescription(data?.length ? data.map((e: any) => `> ${EMOJI[e.action] ?? '•'} **${e.action}** — @${e.details?.username ?? '?'} *(${timeAgo(e.created_at)})*`).join('\n') : 'No entries.');
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'suspicious') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const threshold = interaction.options.getInteger('threshold') ?? 500;
    const since1h   = new Date(Date.now() - 3600000).toISOString();
    const { data } = await supabase.from('unique_users').select('roblox_user_id,username,execution_count,last_seen,first_seen').gte('last_seen', since1h).gte('execution_count', threshold).order('execution_count', { ascending: false }).limit(15);
    const embed = new EmbedBuilder().setTitle(`🚨 Suspicious Users (${data?.length ?? 0})`).setColor(0xef4444)
      .setDescription(data?.length ? data.map((u: any) => {
        const mins = Math.max(1, Math.round((new Date(u.last_seen).getTime() - new Date(u.first_seen).getTime()) / 60000));
        return `> ⚠️ **@${u.username}** — \`${fmt(u.execution_count)} execs\` · ~\`${Math.round(u.execution_count / mins)}/min\``;
      }).join('\n') : `✅ No users above ${fmt(threshold)} executions in last hour.`);
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'fpban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    const reason   = interaction.options.getString('reason')!;
    const { data: rows } = await supabase.from('unique_users').select('roblox_user_id,username,fingerprint').ilike('username', username).limit(1);
    const user = rows?.[0];
    if (!user) return interaction.editReply({ content: `❌ **${username}** not found.` });
    if (!user.fingerprint) return interaction.editReply({ content: `❌ No fingerprint for **${username}**. They need to run the script again.` });
    await supabase.from('fingerprint_bans').insert({ fingerprint: user.fingerprint, roblox_user_id: user.roblox_user_id, username: user.username, reason });
    log('INFO', `@${user.username} device banned — ${reason} (${user.fingerprint})`, 'fpban');
    const embed = new EmbedBuilder().setTitle('🔒 Device Banned').setColor(0xef4444).setDescription([`> 👤 **User** — @${user.username}`, `> 🔑 **Fingerprint** — \`${user.fingerprint}\``, `> 📋 **Reason** — ${reason}`].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'fpunban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    const { data: rows } = await supabase.from('fingerprint_bans').select('id,username').ilike('username', username).limit(1);
    if (!rows?.length) return interaction.editReply({ content: `❌ No device ban for **${username}**.` });
    await supabase.from('fingerprint_bans').delete().eq('id', rows[0].id);
    log('INFO', `@${username} device ban removed`, 'fpunban');
    await interaction.editReply({ content: `✅ Device ban removed for **@${rows[0].username}**` });
  }

  if (commandName === 'fpbans') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const { data } = await supabase.from('fingerprint_bans').select('*').order('created_at', { ascending: false });
    const embed = new EmbedBuilder().setTitle(`🔒 Device Bans (${data?.length ?? 0})`).setColor(0xef4444)
      .setDescription(data?.length ? data.slice(0,20).map((b: any) => `> 🔒 **@${b.username}** — \`${b.fingerprint}\` — ${b.reason ?? 'No reason'} *(${timeAgo(b.created_at)})*`).join('\n') : 'No device bans.');
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'hwidban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    const reason   = interaction.options.getString('reason')!;
    const { data: rows } = await supabase.from('unique_users').select('roblox_user_id,username,hwid').ilike('username', username).limit(1);
    const user = rows?.[0] as any;
    if (!user) return interaction.editReply({ content: `❌ **${username}** not found.` });
    if (!user.hwid) return interaction.editReply({ content: `❌ No HWID found for **${username}**. They need to run the script again.` });
    const { error } = await supabase.from('hwid_bans').insert({ hwid: user.hwid, roblox_user_id: user.roblox_user_id, username: user.username, reason });
    if (error) return interaction.editReply({ content: `❌ ${error.message}` });
    log('INFO', `@${user.username} HWID banned — ${reason}`, 'ban');
    const embed = new EmbedBuilder().setTitle('🔒 HWID Banned').setColor(0xef4444)
      .setDescription([`> 👤 **User** — @${user.username}`, `> 🔑 **HWID** — \`${user.hwid}\``, `> 📋 **Reason** — ${reason}`].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'hwidunban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    const { data: rows } = await supabase.from('hwid_bans').select('id,username').ilike('username', username).limit(1);
    if (!rows?.length) return interaction.editReply({ content: `❌ No HWID ban found for **${username}**.` });
    await supabase.from('hwid_bans').delete().eq('id', (rows[0] as any).id);
    log('INFO', `@${username} HWID ban removed`, 'unban');
    await interaction.editReply({ content: `✅ HWID ban removed for **@${username}**` });
  }

  if (commandName === 'hwidbans') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const { data } = await supabase.from('hwid_bans').select('*').order('created_at', { ascending: false });
    const embed = new EmbedBuilder().setTitle(`🔒 HWID Bans (${data?.length ?? 0})`).setColor(0xef4444)
      .setDescription(data?.length ? data.slice(0,20).map((b: any) => `> 🔒 **@${b.username}** — \`${b.hwid}\` — ${b.reason ?? 'No reason'} *(${timeAgo(b.created_at)})*`).join('\n') : 'No HWID bans.');
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'vpnflags') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const { data } = await supabase.from('vpn_flags').select('*').order('detected_at', { ascending: false }).limit(20);
    const embed = new EmbedBuilder().setTitle(`🌐 VPN/Proxy Flags (${data?.length ?? 0})`).setColor(0xf59e0b)
      .setDescription(data?.length ? data.map((f: any) => `> ⚠️ **@${f.username}** — ${f.provider ?? '?'} (${f.country ?? '?'}) *(${timeAgo(f.detected_at)})*`).join('\n') : 'No VPN flags.');
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'addchangelog') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const game  = interaction.options.getString('game')!;
    const type  = interaction.options.getString('type')!;
    const title = interaction.options.getString('title')!;
    const body  = interaction.options.getString('body') ?? '';
    const date  = new Date().toISOString().slice(0, 10);
    await supabase.from('changelog').insert({ game, type, title, body, date });
    log('INFO', `[changelog] [${type}] ${game} — ${title}`, 'changelog');

    const WEBHOOK = 'https://discord.com/api/webhooks/1475304437177385052/D6bMTTr-Y-h5DHkLAvqVEKZ7Yx7ioyqcnm5yIBzk0Dyk82VxhHe_sMlOISMVLjD52cHF';
    const typeLabel = type === 'new' ? 'New' : type === 'update' ? 'Update' : 'Fix';
    const color = type === 'new' ? 0x10b981 : type === 'update' ? 0x6366f1 : 0xf59e0b;
    const tag = type === 'new' ? '[ NEW ]' : type === 'update' ? '[ UPDATE ]' : '[ FIX ]';
    const sep = '\u2015'.repeat(28);
    const lines = [
      `\`\`\`ansi\n\u001b[2;36m vhxLUA \u2502 Script Update \u2502 ${game}\u001b[0m\`\`\``,
      sep,
      `**${tag}  ${title}**`,
      body ? `\`\`\`\n${body}\`\`\`` : '',
      sep,
      `\`\`\`ansi\n\u001b[2;32m  SCRIPT   \u2502  vhxlua.vercel.app\n\u001b[2;90m  RELEASED \u2502  ${date}\u001b[0m\`\`\``,
    ].filter(Boolean).join('\n');
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'vhxLUA',
        avatar_url: 'https://vhxlua.vercel.app/favicon.ico',
        embeds: [{
          description: lines,
          color,
          footer: { text: 'vhxLUA \u2022 Script Hub' },
        }],
        components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Get Script', url: 'https://vhxlua.vercel.app/?tab=scripts' }] }],
      }),
    }).catch(() => {});

    await interaction.editReply({ content: `✅ Changelog added and posted to Discord — **[${type}] ${title}**` });
  }

  if (commandName === 'maintenance') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const game    = interaction.options.getString('game')!;
    const action  = interaction.options.getString('action')!;
    const message = interaction.options.getString('message') ?? 'This script is under maintenance. Check back soon.';
    const enabled = action === 'on';
    await supabase.from('game_status').upsert({ game_name: game, enabled, maintenance_message: message, updated_at: new Date().toISOString() }, { onConflict: 'game_name' });
    log('INFO', `${game} maintenance ${enabled ? 'disabled' : 'enabled'}`, 'system');
    const embed = new EmbedBuilder()
      .setTitle(enabled ? '✅ Script Live' : '🔧 Maintenance Mode')
      .setColor(enabled ? 0x22c55e : 0xf59e0b)
      .setDescription([
        `> 🎮 **Game** — ${game}`,
        `> 📡 **Status** — ${enabled ? '`LIVE`' : '`MAINTENANCE`'}`,
        ...(enabled ? [] : [`> 💬 **Message** — ${message}`]),
      ].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'gamestatus') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const { data } = await supabase.from('game_status').select('*').order('game_name');
    const embed = new EmbedBuilder()
      .setTitle('📡 Game Status')
      .setColor(0x6366f1)
      .setDescription((data ?? []).map((g: any) =>
        `> ${g.enabled ? '🟢' : '🔴'} **${g.game_name}** — ${g.enabled ? '`LIVE`' : '`MAINTENANCE`'}`
      ).join('\n') || '> No games found');
    await interaction.editReply({ embeds: [embed] });
  }
});

bot.once('ready', async () => {
  mainOnline = true;
  logger.success('bot', `Bot online — ${bot.user?.tag}`);
  registerCommands();
  await updateEmbed();
  await updateChannelName();
  setInterval(updateEmbed, 30000);
  setInterval(updateChannelName, 300000);
});

// ── COUNTER FUNCTIONS ─────────────────────────────────────────────────────────

const counterStart = Date.now();
let counterOnline  = true;
let trackedMessage: any = null;
let lastCount: number | null = null;

async function getTotalExecutions() {
  const { data } = await supabase.from('game_executions').select('count');
  return (data ?? []).reduce((s: number, e: any) => s + (e.count ?? 0), 0);
}

async function updateEmbed() {
  if (!COUNTER_CHANNEL_ID) return;
  const total = await getTotalExecutions();
  const embed = new EmbedBuilder()
    .setTitle('Script Execution Counter')
    .setColor(0x5865f2)
    .addFields({ name: 'Total Executions', value: `\`\`\`${total.toLocaleString()}\`\`\`` })
    .setFooter({ text: 'Updates every 30s  •  Last updated' })
    .setTimestamp();
  if (!trackedMessage) {
    const channel = await bot.channels.fetch(COUNTER_CHANNEL_ID) as any;
    trackedMessage = await channel.send({ embeds: [embed] });
  } else {
    await trackedMessage.edit({ embeds: [embed] });
  }
}

async function updateChannelName() {
  if (!COUNTER_CHANNEL_ID) return;
  const total = await getTotalExecutions();
  if (total === lastCount) return;
  lastCount = total;
  try {
    const channel = await bot.channels.fetch(COUNTER_CHANNEL_ID) as any;
    await channel.setName(`exec-count-${total.toLocaleString()}`);
    logger.info('bot', `Counter channel renamed — ${total.toLocaleString()} total execs`, 'execution');
  } catch (e: any) { logger.warn('bot', `Channel rename failed: ${e.message}`); }
}

// ── BACKGROUND JOBS ───────────────────────────────────────────────────────────
setInterval(async () => {
  const { data } = await supabase.from('banned_users').select('id,username').lte('unban_at', new Date().toISOString()).not('unban_at', 'is', null);
  for (const row of data ?? []) {
    await supabase.from('banned_users').delete().eq('id', row.id);
    log('INFO', `@${row.username} auto-unbanned (softban expired)`, 'unban');
  }
}, 60000);

setInterval(() => {
  if (APP_URL) fetch(`${APP_URL}/api/health`).catch(() => {});
}, 240000);

// ── WEB DASHBOARD ─────────────────────────────────────────────────────────────
const app    = express();
const httpServer = createServer(app);
const io     = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

initLogger(io);

app.use(express.json());

app.use(morgan((tokens, req, res) => {
  const status = parseInt(tokens.status?.(req, res) ?? '0');
  const method = tokens.method?.(req, res) ?? '';
  const url    = tokens.url?.(req, res) ?? '';
  const ms     = tokens['response-time']?.(req, res) ?? '?';
  const level  = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  logger[level]('network', `${method} ${url} ${status} — ${ms}ms`);
  return null;
}));

// Socket.io auth — only admins join admin_stream
io.use((socket, next) => {
  const key = socket.handshake.auth?.adminKey;
  if (key && key === process.env.SHUTDOWN_KEY) {
    (socket as any).isAdmin = true;
    return next();
  }
  next(new Error('Unauthorized'));
});

io.on('connection', (socket) => {
  if (!(socket as any).isAdmin) return socket.disconnect();
  socket.join('admin_stream');
  logger.success('auth', `Admin connected — ${socket.id}`);

  // Send buffer immediately on connect
  socket.emit('log_buffer', getBuffer());

  // Command handler
  socket.on('command', async (cmd: string) => {
    const c = cmd.trim().toLowerCase();
    logger.info('command', `> ${cmd}`);

    if (c === '/status') {
      logger.info('system', `Bot: ${mainOnline ? 'ONLINE' : 'OFFLINE'} | Uptime: ${Math.floor((Date.now() - mainStart) / 1000)}s | Ping: ${bot.ws.ping}ms | Commands: ${commandCount}`);
    } else if (c === '/clear-cache') {
      logs.length = 0;
      logger.success('system', 'In-memory log cache cleared');
    } else if (c === '/executions') {
      const { data } = await supabase.from('game_executions').select('game_name,count').order('count', { ascending: false });
      data?.forEach((r: any) => logger.info('db', `${r.game_name}: ${r.count?.toLocaleString()} execs`));
    } else if (c === '/bans') {
      const { data } = await supabase.from('banned_users').select('username,reason').limit(10);
      logger.info('db', `Active bans: ${data?.length ?? 0}`);
      data?.forEach((b: any) => logger.info('db', `  @${b.username} — ${b.reason}`));
    } else if (c === '/help') {
      ['/status', '/executions', '/bans', '/clear-cache', '/help'].forEach(h => logger.info('system', h));
    } else {
      logger.warn('command', `Unknown command: ${cmd}`);
    }
  });

  socket.on('disconnect', () => {
    logger.warn('auth', `Admin disconnected — ${socket.id}`);
  });
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/status', (_, res) => {
  res.json({
    bot: {
      online: mainOnline,
      uptime: Math.floor((Date.now() - mainStart) / 1000),
      tag: bot.user?.tag ?? null,
      ping: bot.ws.ping,
      commands: commandCount,
      lastCount,
    },
    logs: logs.slice(0, 100),
  });
});

app.post('/api/shutdown', (req, res) => {
  const secret = req.headers['x-shutdown-key'];
  if (secret !== process.env.SHUTDOWN_KEY) return res.status(403).json({ error: 'Forbidden' });
  bot.destroy();
  mainOnline = false;
  log('WARN', 'Bot shut down via dashboard');
  res.json({ ok: true });
});

app.get('/', (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>vhxLUA Bot Control</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:monospace;background:#050505;color:#e0e0e0;min-height:100vh}
header{padding:16px 24px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;justify-content:space-between;background:#0a0a0a}
h1{font-size:16px;color:#fff}h1 span{color:#00ff00}
.sub{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.1em}
main{max-width:1000px;margin:0 auto;padding:24px;display:grid;gap:20px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:20px}
.card h2{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#555;margin-bottom:16px}
.status{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.online{background:#00ff00;box-shadow:0 0 8px #00ff0066}
.offline{background:#ef4444}
.tag{font-size:14px;font-weight:bold;color:#fff}
.meta{font-size:11px;color:#555;margin-top:4px}
.stat{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #111;font-size:12px}
.stat:last-child{border:none}
.stat-label{color:#666}.stat-val{color:#fff;font-weight:bold}
.btn{border:none;padding:8px 16px;border-radius:6px;font-size:11px;font-family:monospace;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;font-weight:bold;transition:opacity .2s}
.btn:hover{opacity:.8}.btn-red{background:#ef4444;color:#fff}.btn-yellow{background:#f59e0b;color:#000}.btn-gray{background:#333;color:#999}
.btn-row{display:flex;gap:8px;margin-top:16px}
.console{background:#000;border-radius:8px;padding:16px;height:300px;overflow-y:auto;font-size:11px;line-height:1.6}
.log-INFO{color:#00ff00}.log-WARN{color:#f59e0b}.log-ERROR{color:#ef4444}
.log-time{color:#333;margin-right:8px}
.key-input{background:#111;border:1px solid #333;color:#fff;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:12px;width:200px;margin-right:8px}
@media(max-width:600px){.grid2{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <div><h1>vhxLUA<span>.CONTROL</span></h1><p class="sub">Bot Management Dashboard</p></div>
  <div id="hstatus" style="font-size:11px;color:#555">Loading...</div>
</header>
<main>
  <div class="card" id="bot-card">
    <h2>🤖 vhxLUA Bot</h2>
    <div class="status"><div class="dot offline" id="bot-dot"></div><span class="tag" id="bot-tag">Offline</span></div>
    <div class="meta" id="bot-meta">—</div>
    <div style="margin-top:16px">
      <div class="stat"><span class="stat-label">Uptime</span><span class="stat-val" id="bot-uptime">—</span></div>
      <div class="stat"><span class="stat-label">Ping</span><span class="stat-val" id="bot-ping">—</span></div>
      <div class="stat"><span class="stat-label">Commands Processed</span><span class="stat-val" id="bot-cmds">—</span></div>
      <div class="stat"><span class="stat-label">Last Exec Count</span><span class="stat-val" id="bot-count">—</span></div>
    </div>
  </div>
  <div class="card">
    <h2>🔴 Danger Zone</h2>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
      <input class="key-input" type="password" id="shutdown-key" placeholder="Shutdown key...">
      <button class="btn btn-red" onclick="shutdown()">Shut Down Bot</button>
    </div>
  </div>
  <div class="card">
    <h2>🖥️ Live Console</h2>
    <div class="console" id="console"></div>
  </div>
</main>
<script>
const fmt=(s)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h+'h '+m+'m '+sec+'s'};
async function refresh(){
  const r=await fetch('/api/status').catch(()=>null);
  if(!r)return;
  const d=await r.json();
  document.getElementById('hstatus').textContent=new Date().toLocaleTimeString();
  const b=d.bot;
  document.getElementById('bot-dot').className='dot '+(b.online?'online':'offline');
  document.getElementById('bot-tag').textContent=b.tag||(b.online?'Online':'Offline');
  document.getElementById('bot-meta').textContent=b.online?'Connected to Discord':'Not connected';
  document.getElementById('bot-uptime').textContent=fmt(b.uptime);
  document.getElementById('bot-ping').textContent=b.ping+'ms';
  document.getElementById('bot-cmds').textContent=b.commands;
  document.getElementById('bot-count').textContent=b.lastCount!=null?b.lastCount.toLocaleString():'—';
  const con=document.getElementById('console');
  con.innerHTML=d.logs.map(l=>'<div><span class="log-time">'+new Date(l.time).toLocaleTimeString()+'</span><span class="log-'+l.level+'">['+(l.level)+'] '+l.msg+'</span></div>').join('');
}
async function shutdown(){
  const key=document.getElementById('shutdown-key').value;
  if(!key){alert('Enter shutdown key first');return}
  if(!confirm('Shut down the bot?'))return;
  await fetch('/api/shutdown',{method:'POST',headers:{'x-shutdown-key':key}});
  refresh();
}
refresh();setInterval(refresh,5000);
</script>
</body>
</html>`);
});

// ── START ─────────────────────────────────────────────────────────────────────
httpServer.listen(3000, '0.0.0.0', () => logger.success('system', 'Web dashboard + Socket.io running on port 3000'));

if (DISCORD_TOKEN_MAIN)    bot.login(DISCORD_TOKEN_MAIN).catch(e => log('ERROR', `Main bot login failed: ${e.message}`));
if (DISCORD_TOKEN_COUNTER) bot.login(DISCORD_TOKEN_COUNTER).catch(e => log('ERROR', `Counter bot login failed: ${e.message}`));
