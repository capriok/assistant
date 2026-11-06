// pm2 setup for running the model on an always-on box (Suitey calls it
// through the tunnel).
// Usage: bun run pm2:start (requires `bun add -g pm2`). See README "Running on a server".

const common = {
  cwd: __dirname,
  script: "bun",
  interpreter: "none",
  autorestart: true,
  restart_delay: 5000,
  max_restarts: 20,
  time: true,
}

module.exports = {
  apps: [
    { ...common, name: "assistant-llm", args: "run server" },
  ],
}
