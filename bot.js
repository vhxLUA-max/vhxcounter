require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const http = require("http");

http.createServer((_, res) => res.end("alive")).listen(3000);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID    = process.env.CHANNEL_ID;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;
const INTERVAL_MS   = 30_000;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const client   = new Client({ intents: [GatewayIntentBits.Guilds] });

let trackedMessage = null;

async function getTotalExecutions() {
    const { data, error } = await supabase
        .from("game_executions")
        .select("count");

    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + (row.count || 0), 0);
}

function buildEmbed(total) {
    return new EmbedBuilder()
        .setTitle("Script Execution Counter")
        .setColor(0x5865F2)
        .addFields({ name: "Total Executions", value: `\`\`\`${total.toLocaleString()}\`\`\`` })
        .setFooter({ text: "Updates every 30s  •  Last updated" })
        .setTimestamp();
}

async function updateEmbed() {
    const total = await getTotalExecutions();
    const embed = buildEmbed(total);

    if (!trackedMessage) {
        const channel = await client.channels.fetch(CHANNEL_ID);
        trackedMessage = await channel.send({ embeds: [embed] });
    } else {
        await trackedMessage.edit({ embeds: [embed] });
    }
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await updateEmbed();
    setInterval(updateEmbed, INTERVAL_MS);
});

client.login(DISCORD_TOKEN);
