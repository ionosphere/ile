# Image du jeu : le serveur Node distribue le site et héberge les salons. Aucune dépendance à installer.
FROM node:22-alpine
WORKDIR /app
COPY package.json index.html ./
COPY styles ./styles
COPY vendor ./vendor
COPY src ./src
COPY server ./server
ENV PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/sante || exit 1
CMD ["node", "server/index.mjs"]
