# Revisão de segurança — v0.2.0

> Esta revisão substitui o piloto V1.1 abaixo. A seção histórica permanece
> para auditoria das decisões anteriores, mas não descreve o protocolo atual.

## Modelo de ameaça atual

Uma sala v0.2.0 é limitada a quatro participantes conhecidos em uma tailnet
restrita. O dono coordena apenas admissões e sinalização; cada fluxo de mídia
segue diretamente por WebRTC DTLS-SRTP entre pares, e nunca passa pelo dono
como relay. O Tailscale transporta os pacotes entre máquinas e não dá acesso
às sub-redes da LAN quando a política é aplicada corretamente.

O SFScreen não protege contra malware, gravação local, uma máquina
desbloqueada ou um participante autorizado que compartilhe conteúdo sensível.
Também não promete conectividade caso o Tailscale esteja indisponível: a sala
pode continuar salva/local, mas convidados só se conectam depois que a
interface Tailscale estiver disponível.

## Controles obrigatórios v0.2.0

- O protocolo v6 limita a sala a quatro membros, serializa admissões e rejeita
  o quinto antes de negociar mídia. Reconexões têm token temporário e janela
  de 30 segundos; token, senha, SDP e ICE não são expostos a logs, chat ou
  diagnósticos.
- `RoomConfigV2` guarda somente salt/verificador de senha. Senha e código
  válido permitem entrada direta, sem a falsa sensação de segurança de uma
  confirmação manual de fingerprint. O código tem sete caracteres, expira em
  dez minutos e pode ser revogado.
- O dono precisa permanecer online; se ele sair da sala, ela termina para os
  membros. Não existe migração automática de host ou eleição que possa alterar
  a autoridade da sala silenciosamente.
- O listener fica no IP Tailscale e o firewall/tailnet permitem apenas a porta
  do SFScreen. Não são usados subnet router, exit node, Tailscale SSH, TURN,
  backend hospedado ou relay de mídia próprio.
- Cada peer negocia slots distintos para tela, câmera, microfone e áudio da
  tela. No Windows, se a exclusão da árvore do SFScreen da captura de sistema
  não puder ser comprovada, o áudio da tela é desligado em vez de arriscar
  vazamento de microfone.
- BrowserWindow mantém sandbox, `nodeIntegration: false`, context isolation,
  CSP restritiva, navegação/browsing bloqueados e IPC mínimo validado. O
  renderer só envia estado de apresentação para o tray e não controla APIs
  nativas arbitrárias.
- Diagnósticos schema v2 aceitam no máximo três pares pseudonimizados e apenas
  contadores agregados autorizados. Nome, IP, candidato ICE, SDP, fingerprint,
  token, senha e mídia são rejeitados pelo validador.

## Histórico: revisão V1.1

## Modelo de ameaça

O piloto é limitado a duas pessoas conhecidas, em PCs Windows 11 pertencentes à mesma tailnet Personal. A tailnet e seus Grants são a primeira barreira de acesso; o código temporário encontra uma sessão, e a comparação externa do código derivado das fingerprints DTLS verifica os endpoints WebRTC.

O SFScreen não protege contra malware, gravação local, alguém com acesso ao PC desbloqueado ou um participante autorizado que compartilhe conteúdo sensível.

## Controles revisados

- BrowserWindow com sandbox, context isolation, Node desativado, navegação e abertura de janelas negadas.
- IPC aceita somente o WebContents da janela principal; todos os argumentos são validados.
- Captura exige frame principal, origem esperada, gesto do usuário, fonte enumerada e autorização de uso único. Áudio só usa `loopback` quando selecionado explicitamente.
- Sinalização fica no IP Tailscale, aceita peers online da tailnet, limita tamanho/tentativas, expira em dez minutos e usa código de uso único com comparação constante.
- Protocolo V3 rejeita clientes anteriores; ICE anuncia somente o IP Tailscale.
- Chromium mDNS é desativado para tornar o IP do adaptador Tailscale identificável. O SFScreen continua descartando todos os candidatos que não correspondem exatamente ao IP Tailscale local antes de qualquer sinalização; endereços de LAN não são enviados ao peer.
- CSP de produção permite conexões somente à própria origem; desenvolvimento adiciona somente o HMR localhost.
- Diagnósticos usam formato permitido e não aceitam código, IP, SDP, candidato, fingerprint, nomes ou conteúdo de mídia.

## Dependências

`npm audit --omit=dev` deve permanecer sem vulnerabilidades. A árvore de ferramentas de build pode reportar alertas transitivos do Electron Forge; eles não acompanham o executável. Atualizações compatíveis devem ser aplicadas quando disponíveis, e qualquer alerta upstream sem correção deve ser registrado antes da distribuição.

Na revisão V1.1, o audit de produção retornou zero alertas. O audit completo ainda aponta dependências transitivas de desenvolvimento do Forge, incluindo `extract-zip` na versão mais recente disponível. Elas só executam no PC que gera o instalador, não são empacotadas no aplicativo e não devem processar arquivos de terceiros. O piloto usa builds locais e o instalador é acompanhado de SHA-256; não foi aplicado downgrade ou override incompatível apenas para ocultar o alerta.
