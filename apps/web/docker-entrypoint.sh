#!/bin/sh

# Substitute environment variables in nginx config
envsubst '${API_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Execute the main command
exec "$@"
