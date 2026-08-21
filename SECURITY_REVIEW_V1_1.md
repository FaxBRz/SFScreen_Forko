# Revisão de segurança — V1.1

## Modelo de ameaça

O piloto é limitado a duas pessoas conhecidas, em PCs Windows 11 pertencentes à mesma tailnet Personal. A tailnet e seus Grants são a primeira barreira de acesso; o código temporário encontra uma sessão, e a comparação externa do código derivado das fingerprints DTLS verifica os endpoints WebRTC.

O SFScreen não protege contra malware, gravação local, alguém com acesso ao PC desbloqueado ou um participante autorizado que compartilhe conteúdo sensível.

## Controles revisados

- BrowserWindow com sandbox, context isolation, Node desativado, navegação e abertura de janelas negadas.
- IPC aceita somente o WebContents da janela principal; todos os argumentos são validados.
- Captura exige frame principal, origem esperada, gesto do usuário, fonte enumerada e autorização de uso único. Áudio só usa `loopback` quando selecionado explicitamente.
- Sinalização fica no IP Tailscale, aceita peers online da tailnet, limita tamanho/tentativas, expira em dez minutos e usa código de uso único com comparação constante.
- Protocolo V3 rejeita clientes anteriores; ICE anuncia somente o IP Tailscale.
- CSP de produção permite conexões somente à própria origem; desenvolvimento adiciona somente o HMR localhost.
- Diagnósticos usam formato permitido e não aceitam código, IP, SDP, candidato, fingerprint, nomes ou conteúdo de mídia.

## Dependências

`npm audit --omit=dev` deve permanecer sem vulnerabilidades. A árvore de ferramentas de build pode reportar alertas transitivos do Electron Forge; eles não acompanham o executável. Atualizações compatíveis devem ser aplicadas quando disponíveis, e qualquer alerta upstream sem correção deve ser registrado antes da distribuição.

Na revisão V1.1, o audit de produção retornou zero alertas. O audit completo ainda aponta dependências transitivas de desenvolvimento do Forge, incluindo `extract-zip` na versão mais recente disponível. Elas só executam no PC que gera o instalador, não são empacotadas no aplicativo e não devem processar arquivos de terceiros. O piloto usa builds locais e o instalador é acompanhado de SHA-256; não foi aplicado downgrade ou override incompatível apenas para ocultar o alerta.
