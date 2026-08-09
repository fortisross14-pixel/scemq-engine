import { defineConfig } from 'vite';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = repositoryName
  ? repositoryName.endsWith('.github.io')
    ? '/'
    : `/${repositoryName}/`
  : '/';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? githubPagesBase : '/',
  server: { port: 5173 },
});
