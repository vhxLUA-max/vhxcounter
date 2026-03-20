import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { createClient } from '@supabase/supabase-js';
import {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
} from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';

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
const log = (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => {
  const entry = { time: new Date().toISOString(), level, msg };
  logs.unshift(entry);
  if (logs.length > 500) logs.pop();
  console.log(`[${level}] ${msg}`);
};

// ── MAIN BOT ─────────────────────────────────────────────────────────────────
const mainBot    = new Client({ intents: [GatewayIntentBits.Guilds] });
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
  new SlashCommandBuilder().setName('tokens').setDescription('List verified tokens').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('user').setDescription('Look up user by token').addStringOption(o => o.setName('token').setDescription('Dashboard token').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('banlog').setDescription('Ban audit trail').addIntegerOption(o => o.setName('limit').setDescription('Number of entries').setMinValue(1).setMaxValue(50)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('suspicious').setDescription('Find potential botters').addIntegerOption(o => o.setName('threshold').setDescription('Threshold').setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('addchangelog').setDescription('Add changelog entry').addStringOption(o => o.setName('game').setDescription('Game').setRequired(true)).addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices({ name: 'New', value: 'new' }, { name: 'Update', value: 'update' }, { name: 'Fix', value: 'fix' })).addStringOption(o => o.setName('title').setDescription('Title').setRequired(true)).addStringOption(o => o.setName('body').setDescription('Body').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

async function registerCommands() {
  if (!DISCORD_TOKEN_MAIN || !CLIENT_ID || !GUILD_ID) return;
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN_MAIN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  log('INFO', 'Slash commands registered');
}

mainBot.on('interactionCreate', async interaction => {
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
    log('INFO', `Banned @${user.username} — ${reason}`);
    const embed = new EmbedBuilder().setTitle('🔨 User Banned').setColor(0xef4444).setDescription([`> 👤 **User** — @${user.username}`, `> 📋 **Reason** — ${reason}`, `> 🛡️ **By** — <@${interaction.user.id}>`].join('\n'));
    await interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'unban') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username')!;
    await supabase.from('banned_users').delete().ilike('username', username);
    log('INFO', `Unbanned @${username}`);
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
    log('INFO', `Softbanned @${user.username} for ${duration} ${unit}`);
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
    log('INFO', `FP banned @${user.username}`);
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
    log('INFO', `FP unbanned @${username}`);
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

  if (commandName === 'addchangelog') {
    if (!admin) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const game  = interaction.options.getString('game')!;
    const type  = interaction.options.getString('type')!;
    const title = interaction.options.getString('title')!;
    const body  = interaction.options.getString('body') ?? '';
    await supabase.from('changelog').insert({ game, type, title, body, date: new Date().toISOString().slice(0, 10) });
    log('INFO', `Changelog added: [${type}] ${title}`);
    await interaction.editReply({ content: `✅ Changelog entry added — **[${type}] ${title}**` });
  }
});

mainBot.once('ready', () => {
  mainOnline = true;
  log('INFO', `Main bot online — ${mainBot.user?.tag}`);
  registerCommands();
});

// ── COUNTER BOT ───────────────────────────────────────────────────────────────
const counterBot   = new Client({ intents: [GatewayIntentBits.Guilds] });
const counterStart = Date.now();
let counterOnline  = false;
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
    const channel = await counterBot.channels.fetch(COUNTER_CHANNEL_ID) as any;
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
    const channel = await counterBot.channels.fetch(COUNTER_CHANNEL_ID) as any;
    await channel.setName(`exec-count-${total.toLocaleString()}`);
    log('INFO', `Counter channel renamed to exec-count-${total.toLocaleString()}`);
  } catch (e: any) { log('WARN', `Channel rename failed: ${e.message}`); }
}

counterBot.once('ready', async () => {
  counterOnline = true;
  log('INFO', `Counter bot online — ${counterBot.user?.tag}`);
  await updateEmbed();
  await updateChannelName();
  setInterval(updateEmbed, 30000);
  setInterval(updateChannelName, 300000);
});

// ── BACKGROUND JOBS ───────────────────────────────────────────────────────────
setInterval(async () => {
  const { data } = await supabase.from('banned_users').select('id,username').lte('unban_at', new Date().toISOString()).not('unban_at', 'is', null);
  for (const row of data ?? []) {
    await supabase.from('banned_users').delete().eq('id', row.id);
    log('INFO', `Auto-unbanned @${row.username}`);
  }
}, 60000);

setInterval(() => {
  if (APP_URL) fetch(`${APP_URL}/api/health`).catch(() => {});
}, 240000);

// ── WEB DASHBOARD ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/status', (_, res) => {
  res.json({
    main: {
      online: mainOnline,
      uptime: Math.floor((Date.now() - mainStart) / 1000),
      tag: mainBot.user?.tag ?? null,
      ping: mainBot.ws.ping,
      commands: commandCount,
    },
    counter: {
      online: counterOnline,
      uptime: Math.floor((Date.now() - counterStart) / 1000),
      tag: counterBot.user?.tag ?? null,
      lastCount,
    },
    logs: logs.slice(0, 100),
  });
});

app.post('/api/shutdown/:bot', (req, res) => {
  const secret = req.headers['x-shutdown-key'];
  if (secret !== process.env.SHUTDOWN_KEY) return res.status(403).json({ error: 'Forbidden' });
  const bot = req.params.bot;
  if (bot === 'main') { mainBot.destroy(); mainOnline = false; log('WARN', 'Main bot shut down via dashboard'); }
  if (bot === 'counter') { counterBot.destroy(); counterOnline = false; log('WARN', 'Counter bot shut down via dashboard'); }
  if (bot === 'all') { mainBot.destroy(); counterBot.destroy(); mainOnline = false; counterOnline = false; log('WARN', 'All bots shut down via dashboard'); }
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
  <div class="grid2">
    <div class="card" id="main-card">
      <h2>⚔️ Main Bot</h2>
      <div class="status"><div class="dot offline" id="main-dot"></div><span class="tag" id="main-tag">Offline</span></div>
      <div class="meta" id="main-meta">—</div>
      <div style="margin-top:16px">
        <div class="stat"><span class="stat-label">Uptime</span><span class="stat-val" id="main-uptime">—</span></div>
        <div class="stat"><span class="stat-label">Ping</span><span class="stat-val" id="main-ping">—</span></div>
        <div class="stat"><span class="stat-label">Commands</span><span class="stat-val" id="main-cmds">—</span></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-red" onclick="shutdown('main')">Shut Down</button>
      </div>
    </div>
    <div class="card" id="counter-card">
      <h2>📊 Counter Bot</h2>
      <div class="status"><div class="dot offline" id="counter-dot"></div><span class="tag" id="counter-tag">Offline</span></div>
      <div class="meta" id="counter-meta">—</div>
      <div style="margin-top:16px">
        <div class="stat"><span class="stat-label">Uptime</span><span class="stat-val" id="counter-uptime">—</span></div>
        <div class="stat"><span class="stat-label">Last Count</span><span class="stat-val" id="counter-count">—</span></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-red" onclick="shutdown('counter')">Shut Down</button>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>🔴 Danger Zone</h2>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
      <input class="key-input" type="password" id="shutdown-key" placeholder="Shutdown key...">
      <button class="btn btn-red" onclick="shutdown('all')">Shut Down All Bots</button>
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
  const m=d.main,c=d.counter;
  document.getElementById('main-dot').className='dot '+(m.online?'online':'offline');
  document.getElementById('main-tag').textContent=m.tag||(m.online?'Online':'Offline');
  document.getElementById('main-meta').textContent=m.online?'Connected to Discord':'Not connected';
  document.getElementById('main-uptime').textContent=fmt(m.uptime);
  document.getElementById('main-ping').textContent=m.ping+'ms';
  document.getElementById('main-cmds').textContent=m.commands;
  document.getElementById('counter-dot').className='dot '+(c.online?'online':'offline');
  document.getElementById('counter-tag').textContent=c.tag||(c.online?'Online':'Offline');
  document.getElementById('counter-meta').textContent=c.online?'Connected to Discord':'Not connected';
  document.getElementById('counter-uptime').textContent=fmt(c.uptime);
  document.getElementById('counter-count').textContent=c.lastCount!=null?c.lastCount.toLocaleString():'—';
  const con=document.getElementById('console');
  con.innerHTML=d.logs.map(l=>'<div><span class="log-time">'+new Date(l.time).toLocaleTimeString()+'</span><span class="log-'+l.level+'">['+(l.level)+'] '+l.msg+'</span></div>').join('');
}
async function shutdown(bot){
  const key=document.getElementById('shutdown-key').value;
  if(!key){alert('Enter shutdown key first');return}
  if(!confirm('Shut down '+bot+'?'))return;
  await fetch('/api/shutdown/'+bot,{method:'POST',headers:{'x-shutdown-key':key}});
  refresh();
}
refresh();setInterval(refresh,5000);
</script>
</body>
</html>`);
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(3000, '0.0.0.0', () => log('INFO', 'Web dashboard running on port 3000'));

if (DISCORD_TOKEN_MAIN)    mainBot.login(DISCORD_TOKEN_MAIN).catch(e => log('ERROR', `Main bot login failed: ${e.message}`));
if (DISCORD_TOKEN_COUNTER) counterBot.login(DISCORD_TOKEN_COUNTER).catch(e => log('ERROR', `Counter bot login failed: ${e.message}`));
