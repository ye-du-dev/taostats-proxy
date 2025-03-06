module.exports = {
  apps: [{
    name: 'tao-stats-proxy',
    script: 'api.py',
    interpreter: 'python3',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      FLASK_ENV: 'production',
      CMC_PRO_API_KEY: process.env.CMC_PRO_API_KEY,
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_logs: '10d',
    exp_backoff_restart_delay: 100,
    listen_timeout: 10000,
    kill_timeout: 3000,
    wait_ready: true,
    ready_timeout: 10000,
  }]
};
