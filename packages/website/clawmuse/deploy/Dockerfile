# Build first: npm run build:clawmuse --workspace=@getpaseo/website
# Context: repository root. The runtime serves only the branded static output.
FROM nginx:alpine
COPY packages/website/clawmuse/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY packages/website/dist/clawmuse/ /usr/share/nginx/html/
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
