# SFScreen — opções de conectividade P2P

## Decisão ativa para v0.2.0

Esta é a decisão que vale para o aplicativo atual; as alternativas comparadas
no restante do documento são contexto histórico para uma possível revisão
futura.

- O Tailscale é o transporte entre máquinas. Não há Cloudflare, TURN, SFU,
  backend hospedado, relay próprio ou conta de usuário do SFScreen.
- Uma sala pode ser criada e persistir localmente sem pares Tailscale. Ela é
  anunciada assim que a interface Tailscale estiver disponível, mas convidados
  só a alcançam pela rede Tailscale autorizada.
- A sala aceita no máximo quatro pessoas em uma malha WebRTC completa: cada
  cliente mantém no máximo três conexões e o dono coordena membros e
  sinalização, sem retransmitir mídia. O dono precisa continuar aberto; não
  existe migração automática de host.
- O protocolo v6 usa senha obrigatória (guardada apenas como
  salt/verificador) e código reutilizável de sete caracteres por dez minutos.
  Senha ou código válidos dão entrada direta, sem comparação manual de
  fingerprint. Clientes anteriores precisam atualizar.
- A tailnet deve ser dedicada ou usar compartilhamento de dispositivo, sem
  subnet router, exit node ou Tailscale SSH. Firewall e listener aceitam
  somente a porta do SFScreen na interface Tailscale.

O Tailscale não transforma a sala em um serviço hospedado: ele apenas entrega
o tráfego entre pares. Chat e eventos permanecem temporários, e a mídia segue
protegida por DTLS-SRTP dentro do WebRTC.

---

Este documento compara cinco arquiteturas possíveis para o SFScreen, considerando o cenário principal:

- Uso privado entre amigos e conhecidos.
- Windows 11.
- Compartilhamento de tela em 1080p60 por sessões que podem durar 12 horas.
- Áudio do sistema.
- Criptografia ponta a ponta.
- Preferência por custo zero.
- Nenhum acesso à LAN doméstica ou aos demais dispositivos dos participantes.

## Resumo rápido

| Opção | Conta para cada usuário | Relay disponível | Custo provável | 1080p60 prolongado | Complexidade para o SFScreen |
|---|---:|---:|---:|---:|---:|
| 1. Tailscale + DERP | Sim | Sim, DERP | Gratuito para uso pessoal dentro dos limites do plano | Ótimo quando direto; DERP pode limitar velocidade | Baixa |
| 2. WebRTC + Cloudflare | Não | Sim, TURN | Gratuito até a franquia; pago acima dela | Ótimo direto; relay pode ultrapassar 1 TB/mês | Média |
| 3. ZeroTier | Normalmente sim para administrar | Sim | Gratuito para uso pessoal limitado | Ótimo direto; relay gratuito é best effort | Média |
| 4. Iroh | Não para os participantes | Sim, público e limitado | Gratuito para hobby/testes | Incerto no relay público; exige transporte de mídia próprio | Alta |
| 5. WebRTC direto, sem relay | Não | Não | Zero | Ótimo quando conecta; algumas redes não conectam | Média |

---

## Opção 1 — Tailscale com P2P e DERP

### Como funcionaria

Cada participante instalaria e autenticaria o Tailscale. O SFScreen usaria a rede virtual do Tailscale apenas como transporte. O Tailscale tentaria uma conexão WireGuard direta e utilizaria DERP quando a conexão direta não fosse possível.

Para não expor a LAN, haveria duas configurações possíveis:

1. Criar uma tailnet separada exclusivamente para o SFScreen; ou
2. Compartilhar somente o dispositivo que executa o SFScreen usando `Share device`.

Em ambos os casos, as políticas permitiriam apenas a porta do SFScreen. Não seriam configurados subnet router, exit node ou Tailscale SSH.

### Pontos positivos

- Resolve descoberta, NAT traversal, criptografia e relay.
- Usa WireGuard com criptografia ponta a ponta.
- DERP não consegue descriptografar o tráfego.
- Normalmente consegue uma conexão direta sem consumir banda de servidor.
- Não exige que o projeto mantenha VPS, TURN ou servidor de sinalização.
- Muito apropriado para um grupo pequeno de pessoas conhecidas.
- O recurso `Share device` não anuncia as sub-redes da LAN para o destinatário.
- Podemos limitar o acesso à porta TCP/UDP exclusiva do SFScreen.
- O aplicativo pode manter WebRTC por cima do Tailscale, adicionando uma segunda camada de criptografia.

### Pontos negativos

- Cada participante precisa instalar e autenticar o Tailscale.
- Compartilhamento e permissões precisam ser configurados antes da primeira sessão.
- A política padrão não deve ser usada; é necessário negar tudo e liberar somente o SFScreen.
- DERP tem qualidade de serviço e throughput limitados para manter justiça entre usuários.
- Uma sessão 1080p60 pode perder qualidade quando permanecer em DERP.
- O Tailscale ainda observa metadados de dispositivos, IPs, horários e conexões.
- O fluxo deixa de ser totalmente “abrir o SFScreen e digitar qualquer código”, pois há um setup inicial do Tailscale.

### Segurança da LAN

Esta opção não precisa colocar o amigo dentro da LAN física. A configuração deverá cumprir todos estes requisitos:

- Tailnet dedicada ou compartilhamento individual de dispositivo.
- Nenhuma rota `192.168.x.x`, `10.x.x.x` ou equivalente anunciada.
- Sem subnet router.
- Sem exit node.
- Sem Tailscale SSH.
- Regra permitindo somente a porta do SFScreen.
- Firewall do Windows aceitando essa porta apenas pela interface Tailscale.
- Serviço escutando no IP Tailscale, e não em todas as interfaces.

### Adequação ao projeto

É a opção mais simples e econômica para amigos conhecidos. Deve ser a favorita se todos aceitarem instalar o Tailscale.

Referências: [Device Sharing](https://tailscale.com/docs/features/sharing), [tipos de conexão](https://tailscale.com/docs/reference/connection-types), [DERP](https://tailscale.com/docs/reference/derp-servers).

---

## Opção 2 — WebRTC com Cloudflare STUN/TURN

### Como funcionaria

O SFScreen usaria WebRTC diretamente. Um Cloudflare Worker ou serviço semelhante associaria códigos temporários e encaminharia sinalização cifrada. O STUN descobriria as rotas P2P e o TURN seria usado somente quando a conexão direta falhasse.

Somente o projeto SFScreen teria conta na Cloudflare. Os usuários não precisariam instalar nada, criar conta ou conhecer a infraestrutura.

### Pontos positivos

- Melhor experiência para o usuário: abrir, digitar código, aceitar e compartilhar.
- Nenhuma conta externa para os participantes.
- Nenhuma VPN ou rede virtual instalada no computador.
- WebRTC fornece codecs, adaptação de bitrate, sincronização, controle de congestionamento e DTLS-SRTP.
- STUN da Cloudflare é atualmente gratuito e ilimitado.
- TURN possui atualmente uma franquia gratuita de 1.000 GB mensais.
- Sessões P2P diretas não consomem a franquia TURN.
- Mesmo quando passa pelo TURN, tela e áudio continuam criptografados de ponta a ponta.
- É possível cifrar também a sinalização para que o Worker veja apenas mensagens opacas.

### Pontos negativos

- Se uma dupla ficar permanentemente em TURN, 1 TB pode não ser suficiente.
- Acima da franquia atual, a Cloudflare cobra por GB.
- O projeto precisa manter Worker, credenciais temporárias, sinalização e monitoramento de uso.
- Existe dependência da conta e das regras comerciais da Cloudflare.
- A Cloudflare observa IPs, horários, volume e padrões de conexão.
- É preciso impedir que chaves administrativas sejam incluídas dentro do aplicativo.
- Caso o limite gratuito seja atingido e pagamentos estejam desabilitados, usuários atrás de NAT restritivo podem deixar de conectar.

### Impacto das sessões longas

Estimativa de tráfego TURN para uma tela, sem contar pequenos overheads:

| Bitrate de vídeo | Consumo por hora | Sessão de 12 horas | 30 sessões de 12 horas |
|---:|---:|---:|---:|
| 4 Mbps | 1,8 GB | 21,6 GB | 648 GB |
| 8 Mbps | 3,6 GB | 43,2 GB | 1,30 TB |
| 12 Mbps | 5,4 GB | 64,8 GB | 1,94 TB |

Se os dois participantes transmitirem simultaneamente com bitrates semelhantes, o consumo aproximado dobra. Esses valores só se aplicam quando o TURN é realmente utilizado.

### Adequação ao projeto

É a melhor opção para transformar o SFScreen em um produto simples para pessoas não técnicas. Para o uso privado e intensivo descrito, o risco é depender da franquia quando uma conexão não consegue sair do relay.

Referências: [Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/faq/), [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections), [segurança WebRTC](https://www.rfc-editor.org/rfc/rfc8827.html).

---

## Opção 3 — ZeroTier

### Como funcionaria

O ZeroTier criaria uma rede virtual privada semelhante ao Tailscale. Os dispositivos entrariam em uma rede usando um Network ID e o SFScreen se comunicaria apenas pelo endereço virtual. O ZeroTier tentaria conexão P2P e usaria seus relays quando necessário.

Também seria possível avaliar a incorporação do SDK `libzt` no SFScreen, reduzindo a necessidade de uma interface separada do ZeroTier.

### Pontos positivos

- Criptografia ponta a ponta com chaves privadas mantidas nos dispositivos.
- Conexão P2P na maioria das redes.
- Plano pessoal gratuito para uma quantidade limitada de dispositivos.
- Relays gratuitos disponíveis como fallback.
- Rede pode ser isolada da LAN física.
- SDK disponível para integração em aplicações.
- Pode funcionar com um Network ID em vez de convidar usuários para a rede doméstica.

### Pontos negativos

- Ainda exige instalação do serviço ZeroTier ou integração de um SDK nativo.
- Uma rede privada precisa de controlador e autorização de membros.
- O relay gratuito é descrito como lento e best effort.
- A própria documentação não garante confiabilidade para tráfego relayed.
- Pode ser menos simples de administrar que o Tailscale para usuários comuns.
- Também exige regras restritivas para que os participantes alcancem somente o SFScreen.
- O plano gratuito é destinado principalmente a uso pessoal, testes e pequenos ambientes; os termos podem mudar.

### Segurança da LAN

Criar uma rede ZeroTier exclusiva não dá acesso automático à LAN. O risco surgiria apenas se alguém configurasse bridge, roteamento ou exposição adicional. O SFScreen deveria permitir somente sua porta e o Firewall do Windows deveria bloquear o restante.

### Adequação ao projeto

É a alternativa mais próxima do Tailscale. Vale testar se o processo de adesão por Network ID for mais aceitável para o grupo, mas seu relay é menos atraente para 1080p60 prolongado.

Referências: [protocolo ZeroTier](https://docs.zerotier.com/protocol/), [relay](https://docs.zerotier.com/relay/), [SDK Socket API](https://docs.zerotier.com/sockets/).

---

## Opção 4 — Iroh com relays públicos

### Como funcionaria

O Iroh seria incorporado diretamente ao SFScreen como biblioteca P2P. Cada instalação teria um Endpoint ID criptográfico. Os participantes trocariam esse identificador por meio do código do SFScreen. O Iroh tentaria conexão QUIC direta e utilizaria relays públicos quando necessário.

### Pontos positivos

- Feito especificamente para incorporar conectividade P2P em aplicativos.
- Não exige conta para cada participante.
- QUIC com TLS 1.3 e criptografia ponta a ponta.
- Relays públicos gratuitos e prontos para uso.
- NAT traversal e fallback automáticos.
- Código aberto e possibilidade de trocar ou hospedar relays no futuro.
- Endpoint ID pode fazer parte do próprio código de convite.
- O relay não consegue ler o conteúdo transmitido.

### Pontos negativos

- Os relays públicos são rate-limited e não possuem SLA.
- A documentação recomenda os relays gratuitos apenas para desenvolvimento e hobby.
- Para produção, o próprio projeto recomenda relay dedicado ou self-hosted.
- Iroh fornece transporte de dados, não uma solução completa de mídia em tempo real.
- Seria necessário implementar ou integrar codecs, sincronização audiovisual, jitter buffer, bitrate adaptativo e controle de congestionamento.
- Maior risco técnico para manter 1080p60 estável durante 12 horas.
- A integração seria predominantemente Rust/nativa, aumentando a complexidade do cliente Electron.

### Adequação ao projeto

É a opção mais interessante para experimentar uma arquitetura realmente incorporada e sem contas. Não é a primeira escolha para o MVP porque WebRTC já resolve a parte difícil de transmissão de mídia.

Referências: [NAT traversal do Iroh](https://docs.iroh.computer/concepts/nat-traversal), [relays](https://docs.iroh.computer/concepts/relays), [infraestrutura gratuita](https://www.iroh.computer/services/hosting).

---

## Opção 5 — WebRTC direto, sem TURN

### Como funcionaria

O SFScreen usaria WebRTC, sinalização mínima e STUN gratuito, mas nunca configuraria um servidor TURN. Os clientes tentariam apenas conexão direta. Também poderiam usar IPv6, UPnP, NAT-PMP ou abertura manual de uma porta para aumentar a chance de sucesso.

### Pontos positivos

- Custo de relay igual a zero.
- Toda mídia trafega diretamente entre os computadores.
- Mantém codecs, áudio, sincronização e adaptação oferecidos pelo WebRTC.
- Nenhum provedor recebe o fluxo de mídia, nem mesmo cifrado.
- Excelente desempenho quando a conexão direta funciona.
- Não exige Tailscale, ZeroTier ou VPN instalada.
- Os usuários não precisam de contas externas.

### Pontos negativos

- Não funciona em algumas combinações de CGNAT, NAT simétrico e firewall restritivo.
- Redes corporativas, hotéis e operadoras móveis podem bloquear a conexão.
- Abrir portas manualmente é ruim para usuários não técnicos.
- UPnP pode estar desativado ou ser considerado indesejável por segurança.
- Sem relay não existe plano B: a sessão simplesmente não inicia.
- Ainda é necessário algum método de sinalização ou troca manual de SDP.
- Um usuário pode funcionar perfeitamente com um amigo e nunca conectar com outro.

### Adequação ao projeto

É aceitável se o grupo testar suas redes e confirmar que todas conseguem P2P direto. Pode ser combinado com uma configuração avançada de porta para eliminar custos, aceitando falhas de conectividade.

Referência: [sinalização, STUN e TURN no WebRTC](https://webrtc.org/getting-started/peer-connections).

---

## Comparação por prioridade

### Menor custo possível

1. WebRTC direto sem TURN.
2. Tailscale dentro do plano gratuito.
3. ZeroTier dentro do plano gratuito.
4. Iroh com relay público limitado.
5. Cloudflare, caso ultrapasse 1 TB de TURN.

### Melhor experiência para o usuário

1. WebRTC + Cloudflare.
2. Iroh incorporado, se toda a mídia adicional for bem implementada.
3. Tailscale.
4. ZeroTier.
5. WebRTC direto com configuração manual.

### Melhor opção para 12 horas de 1080p60

1. Qualquer opção quando a conexão é realmente P2P direta.
2. Tailscale direto.
3. ZeroTier direto.
4. Cloudflare TURN, sujeito à franquia.
5. DERP, relay do ZeroTier ou relay público do Iroh, sujeitos a limites de throughput.

### Menor risco de acesso indevido à LAN

1. WebRTC + Cloudflare.
2. WebRTC direto sem TURN.
3. Iroh incorporado.
4. Tailscale corretamente isolado e limitado por porta.
5. ZeroTier corretamente isolado e limitado por porta.

Nas opções 4 e 5 da lista acima, o risco vem de configuração incorreta da rede virtual, não de uma necessidade técnica de expor a LAN.

---

## Recomendação preliminar

Para o cenário atual — poucos amigos, uso privado, custo zero e sessões muito longas — a primeira prova de conceito deveria testar duas opções:

1. **Tailscale com tailnet exclusiva ou `Share device`, política restritiva e WebRTC por cima.**
2. **WebRTC direto sem TURN, usando Cloudflare apenas como fallback opcional e desativável.**

O teste precisa registrar se cada dupla fica em conexão direta ou relay durante suas redes habituais. Essa medição decide melhor que uma estimativa:

- Se quase todas as sessões forem diretas, Cloudflare oferece a melhor experiência sem custo relevante.
- Se o Tailscale conseguir conexão direta com mais frequência, ele é melhor para o grupo privado.
- Se ambos permanecerem frequentemente em relay, será necessário aceitar menor qualidade, abrir uma porta ou fornecer algum relay com banda suficiente; não existe relay ilimitado sem que alguém forneça e pague a conexão.

## Princípio de segurança comum às cinco opções

Independentemente da rede escolhida, o SFScreen deve manter sua própria proteção:

- WebRTC com DTLS-SRTP para tela e áudio.
- Código de sessão temporário.
- Confirmação criptográfica do peer.
- Nenhuma confiança no nome informado pelo usuário.
- Nenhuma porta administrativa exposta.
- Nenhuma rota para a LAN.
- Firewall negando tudo que não seja explicitamente necessário.
- Sem chat, arquivos, controle remoto ou histórico de sessões.

