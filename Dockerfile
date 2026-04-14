# Usa a imagem oficial do Node.js
FROM node:22-slim

# Instala as dependências necessárias para o Chrome/puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
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

# Instala o Chrome estável
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência primeiro (para melhor cache do Docker)
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY postinstall.js ./

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