## Visão Geral
Este projeto é um chatbot para WhatsApp desenvolvido em Node.js que oferece atendimento automatizado para diferentes setores de uma empresa (Vendas, Pedidos e SAC). Utiliza a biblioteca `whatsapp-web.js` e inclui recursos avançados como gerenciamento de sessões, links assinados, relatórios e comandos administrativos.

## Funcionalidades Principais

### 🗂️ Gerenciamento de Sessões
- Estados controlados para diferentes estágios de interação
- Timeout automático de sessões inativas
- Mapa de sessões ativas

### 🔗 Links Assinados
- Geração de links com assinatura HMAC-SHA256
- Validação de integridade de links
- Expiração configurável (1 hora padrão)

### 📊 Relatórios e Exportação
- Geração de relatórios por período (dia, mês)
- Exportação para Excel
- Estatísticas de interações

### ⚙️ Comandos de Administrador
```bash
!ping       # Verifica se o bot está online
!reiniciar  # Reinicia o bot
!limpar     # Limpa todas as sessões ativas
!exportar   # Exporta relatório para Excel (ex: !exportar 2025 04)
!relatorio  # Gera relatório (ex: !relatorio hoje)
🔄 Rotação de Atendentes
Distribuição equitativa de contatos entre vendedores

Configuração flexível de equipes

Configuração
Variáveis de Ambiente (.env)
env
LINK_SECRET=chave_secreta_para_assinatura
ADMIN_NUMBER=5599999999999@c.us
WA_VERSION=2.2412.54
ENCRYPTION_KEY=chave_criptografia
Possíveis Variações
Tipos de Atendimento
Setor	Função
Vendas	Contato com equipe comercial
Pedidos	Acompanhamento de status
SAC	Atendimento Mercado Livre/Site
Personalizações
Saudações por horário:

javascript
function getGreetingByHour() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
Adicionar novos setores:

javascript
const NOVOS_SETORES = {
  financeiro: {
    '1': { 
      nome: "Financeiro", 
      link: getSignedLink('https://wa.me/5599999999999') 
    }
  }
};
Novos comandos administrativos:

javascript
case '!backup':
  // Implementar lógica de backup
  return client.sendMessage(chatId, 'Backup realizado com sucesso!');
Execução
Iniciar via npm
bash
npm install
node chatbot.js
Comandos Docker
bash
docker build -t whatsapp-bot .
docker run -d --name whatsapp-bot-container whatsapp-bot
