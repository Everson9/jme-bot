# Usa a imagem oficial do Node.js
FROM node:22-slim

# Instala as dependências necessárias para o Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configura o Puppeteer para usar Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência primeiro
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Instala as dependências do Node
RUN npm install
RUN cd frontend && npm install

# Copia o resto do código
COPY . .

# Build do frontend
RUN cd frontend && npm run build

# Expõe a porta
EXPOSE 3001

# Comando para iniciar o bot
CMD ["node", "index.js"]