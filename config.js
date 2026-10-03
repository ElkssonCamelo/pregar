/* Configuração pública do Supabase (a chave "publishable" é feita para ficar no navegador; quem protege os dados é o login + RLS no banco).
   NUNCA coloque aqui a chave "secret" nem "service_role". Vazio = o app funciona normalmente, só sem sincronizar. */
window.PREGAR_CONFIG = {
  supabaseUrl: 'https://pedfhqffsqpuwkurziqy.supabase.co',
  supabaseKey: 'sb_publishable_opG2JU0_lTjodbxdpnIVPw_nNI7J_SJ',
  requireLogin: true   // true = o app pede e-mail e senha ao abrir (só enquanto não houver login neste aparelho)
};
