# Generic container build for Railway / Fly.io / Render (Docker) / any VPS.
# Zero third-party dependencies: no npm install needed at runtime.

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/var/lib/yuchuan \
    FORCE_HTTPS=1

COPY . .

# The volume lives OUTSIDE /app/data so the bundled seed db.json is never
# shadowed by the mount. lib/store.js copies it into the volume on first boot.
RUN mkdir -p /var/lib/yuchuan/uploads \
 && addgroup -S app \
 && adduser -S app -G app \
 && chown -R app:app /var/lib/yuchuan

VOLUME ["/var/lib/yuchuan"]
EXPOSE 3000
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/site').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})"

CMD ["node", "server.js"]
