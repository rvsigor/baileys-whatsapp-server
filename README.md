# Baileys WhatsApp Server

Servidor Node.js usando Baileys para integração com WhatsApp Web.

## 🚀 Deploy no Render

### 1. Configurar MongoDB Atlas
- Criar conta em https://mongodb.com/atlas
- Criar cluster gratuito
- Obter connection string

### 2. Configurar Redis (Upstash)
- Criar conta em https://upstash.com
- Criar database Redis
- Obter REDIS_URL

### 3. Deploy no Render
- Conectar este repositório no Render
- Configurar como Web Service
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Adicionar variáveis de ambiente do `.env.example`

## 🔧 Variáveis de Ambiente Necessárias
API_KEY=seu_api_key_forte
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://...
WEBHOOK_URL=https://seu-supabase.functions.v1/whatsapp-webhook
WEBHOOK_SECRET=seu_secret

## 📡 Endpoints

### Health Check
GET /health

### Iniciar Instância
POST /api/instance/start
Body: { "instanceId": "org_uuid" }

### Obter QR Code
GET /api/instance/qr/:instanceId

### Status da Instância
GET /api/instance/status/:instanceId

### Enviar Mensagem
POST /api/messages/send
Body: {
  "instanceId": "org_uuid",
  "to": "5527999999999",
  "message": "Olá!"
}

### Desconectar
POST /api/instance/disconnect
Body: { "instanceId": "org_uuid" }