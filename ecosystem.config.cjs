// Optional pm2 setup for running the HTTP API on an always-on box.
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
    { ...common, name: "assistant-api", args: "run assist:http" },
  ],
}
