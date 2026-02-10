module.exports = {
  apps: [
    // API Server (Production)
    {
      name: "vpsos-api",
      script: "apps/api/src/index.ts",
      interpreter: "bun",
      cwd: __dirname,
      env: {
        // Add Bun to PATH
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
        
        // Production settings
        NODE_ENV: "production",
        PORT: 3000,
        REQUIRE_AUTH: "true",
        FS_SANDBOX: "on",
        ALLOW_RUN_AS_ROOT: "false",
        DEFAULT_SHELL: "/bin/bash",
        MAX_PROCS: 32,
        MAX_PTY: 16,
        MAX_OUTPUT_BYTES: 500000,
        MAX_UPLOAD_BYTES: 10485760,
        GIT_PULL_REBASE: "true",
        GIT_DEFAULT_REMOTE: "origin",
      },
      // Auto-restart on failure
      autorestart: true,
      // Restart memory limit (200MB)
      max_memory_restart: "200M",
      // Logging
      log_file: "./logs/api-combined.log",
      out_file: "./logs/api-out.log",
      error_file: "./logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Wait for ready signal (if your app sends one)
      // listen_timeout: 10000,
      // kill_timeout: 5000,
    },
    
    // Web App (Production - static files via Vite preview)
    // Note: Run `bun run --filter @vpsos/web build` first before starting
    {
      name: "vpsos-web",
      script: "apps/web/package.json",
      interpreter: "bun",
      cwd: __dirname,
      args: "run preview",
      env: {
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
        NODE_ENV: "production",
      },
      autorestart: true,
      max_memory_restart: "150M",
      log_file: "./logs/web-combined.log",
      out_file: "./logs/web-out.log",
      error_file: "./logs/web-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
