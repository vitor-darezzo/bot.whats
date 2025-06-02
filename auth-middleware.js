const authorizedNumbers = [
    process.env.ADMIN_NUMBER,
    // Adicione outros números autorizados aqui
  ].filter(Boolean);
  
  function isAuthorized(number) {
    return number === process.env.ADMIN_NUMBER;
  }
  
  function authMiddleware(handler) {
    // Middleware agora permite todos os usuários
    return async (msg) => {
      return handler(msg);
    };
  }
  
  module.exports = { authMiddleware, isAuthorized };
  