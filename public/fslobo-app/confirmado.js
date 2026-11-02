/* Descarta tokens/parâmetros do link de confirmação e segue para a tela de entrada.
   Não lê, não guarda e não envia nenhum valor da URL. */
(function () {
  var raw = (window.location.hash || "") + "&" + (window.location.search || "");
  var dest = "/app/entrar?confirmado=1";
  if (/(^|[?&#])(error|error_code|error_description)=/.test(raw)) {
    var m = raw.match(/error_code=([a-z_]+)/);
    dest = "/app/entrar?erro=" + (m ? m[1] : "link");
  }
  window.location.replace(dest);
})();
