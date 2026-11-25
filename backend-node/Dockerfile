FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build
EXPOSE 8000
# Sesuaikan struktur database dengan skema sebelum server menerima permintaan.
# Perubahan yang berisiko menghapus data DITOLAK (tanpa --accept-data-loss), sehingga container gagal dengan pesan jelas.
CMD ["npm", "run", "start:prod"]
