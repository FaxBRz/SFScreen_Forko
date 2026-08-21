# SFScreen V0 com Tailscale

1. Instale o Tailscale em cada PC Windows e entre na mesma tailnet Personal exclusiva do grupo.
2. Não ative subnet router, exit node ou Tailscale SSH.
3. Em **Access controls**, substitua a política padrão pela política abaixo, ajustando os membros quando necessário:

```json
{
  "grants": [
    {
      "src": ["autogroup:member"],
      "dst": ["autogroup:member"],
      "ip": ["tcp:43917", "udp:43920-44019"]
    }
  ]
}
```

4. Confirme que os dois PCs aparecem online no Tailscale. O SFScreen exibirá esse diagnóstico ao abrir.
5. No apresentador, clique em **Criar sessão** e envie somente o código `XXX-XXX-X` ao espectador.
6. No espectador, digite o código e clique em **Conectar**. Ambos devem comparar e confirmar o código de segurança exibido.

O aplicativo abre o listener de sinalização apenas no IP Tailscale e somente enquanto a sessão estiver aguardando a resposta. Nenhuma rota da LAN física é anunciada por esta configuração.
