module.exports = {
  apps: [
    {
      name: "wagate",
      script: "src/index.ts",
      interpreter: "bun",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // Structured JSON logs for easy parsing
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 5000,
    },
  ],
};
