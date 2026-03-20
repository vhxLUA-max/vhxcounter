import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      'process.env.SUPABASE_KEY': JSON.stringify(env.SUPABASE_KEY),
      'process.env.DISCORD_TOKEN': JSON.stringify(env.DISCORD_TOKEN),
      'process.env.CLIENT_ID': JSON.stringify(env.CLIENT_ID),
      'process.env.GUILD_ID': JSON.stringify(env.GUILD_ID),
      'process.env.ADMIN_USER_IDS': JSON.stringify(env.ADMIN_USER_IDS),
      'process.env.CHANNEL_ID': JSON.stringify(env.CHANNEL_ID),
      'process.env.APP_URL': JSON.stringify(env.APP_URL),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
