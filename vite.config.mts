import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import checker from 'vite-plugin-checker';
import tsconfigPaths from 'vite-tsconfig-paths';

export default ({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

  return defineConfig({
    plugins: [
      tsconfigPaths(),
      react(),
      // checker({
      //   typescript: true,
      //   eslint: {
      //     useFlatConfig: true,
      //     lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
      //   },
      //   overlay: {
      //     initialIsOpen: false,
      //   },
      // }),
    ],
    preview: {
      port: Number(process.env.VITE_APP_PORT || 1420),
    },
    server: {
      host: '0.0.0.0',
      port: Number(process.env.VITE_APP_PORT || 1420),
      // 端口被占用时直接失败，避免 Tauri 仍指向旧端口上的旧服务
      strictPort: true,
    },
    base: process.env.NODE_ENV === 'production' ? process.env.VITE_BASENAME : '/',
  });
};
