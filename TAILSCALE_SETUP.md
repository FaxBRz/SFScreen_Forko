# SFScreen V1.2 com Tailscale

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
5. No apresentador, escolha um monitor, opcionalmente marque **Compartilhar áudio do sistema**, clique em **Criar sessão** e envie somente o código `XXX-XXX-X` ao espectador.
6. No espectador, digite o código e clique em **Conectar**. Ambos devem comparar e confirmar o código de segurança exibido; só então o apresentador pode iniciar o vídeo.

O aplicativo abre o listener de sinalização apenas no IP Tailscale e somente enquanto a sessão estiver aguardando a resposta. Nenhuma rota da LAN física é anunciada por esta configuração.

## Aceite manual da V1.2

Em dois PCs Windows diferentes, ambos usando a mesma versão do SFScreen:

1. Confirme que o diagnóstico mostra o Tailscale pronto e pelo menos um peer online.
2. Crie a sessão no apresentador e entre pelo código no espectador.
3. Compare o código criptográfico de seis dígitos por voz ou mensagem externa; os dois lados devem confirmar.
4. Confirme que o painel informa **Conexão verificada** e mostra a rota `direct`, `relay`, `peer-relay` ou `unknown`.
5. No apresentador, clique em **Iniciar compartilhamento** e confirme o vídeo do monitor escolhido no espectador.
6. Com áudio habilitado, confirme que o apresentador ainda escuta o próprio PC e o espectador pode usar **Ativar som**, volume e **Silenciar**. Nenhum microfone deve ser transmitido.
7. Pare o compartilhamento, confirme que a conexão permanece aberta e que o espectador não vê o último frame.
8. Escolha um monitor novamente, retome o vídeo e confirme que nenhum novo código é necessário.
9. Exporte o diagnóstico local depois de uma falha ou sessão longa; ele não deve conter código, IP, SDP, candidatos, nome de monitor ou conteúdo de mídia.
10. Encerre em qualquer lado e confirme que o código não pode mais ser reutilizado.

Esta versão transmite um monitor por vez em até 1080p30 e, opcionalmente, o áudio do sistema do Windows. A captura só é autorizada para a fonte escolhida e depois da confirmação bilateral.
