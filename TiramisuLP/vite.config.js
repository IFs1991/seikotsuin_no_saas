import { defineConfig, loadEnv } from 'vite';
import { handleGeminiHttpRequest } from './src/server/gemini-handler.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    server: {
      host: '0.0.0.0',
    },
    plugins: [
      {
        name: 'local-gemini-api',
        configureServer(server) {
          server.middlewares.use('/api/gemini', async (req, res) => {
            await handleGeminiHttpRequest(req, res, process.env);
          });
        },
      },
    ],
  };
});
