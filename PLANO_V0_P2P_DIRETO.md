# SFScreen V0 — prova de conceito P2P direta

## 1. Objetivo

Construir uma V0 experimental para validar se dois computadores Windows 11 conseguem compartilhar tela e áudio com boa qualidade, baixa latência e estabilidade usando uma conexão WebRTC direta.

Esta versão não é o produto final. Ela existe para responder, com medições reais:

- A captura de tela consegue sustentar 1080p60?
- O áudio do sistema permanece sincronizado durante sessões longas?
- O WebRTC consegue usar aceleração de hardware nos computadores do grupo?
- Quais duplas conseguem uma conexão P2P direta?
- Quais redes exigiriam STUN, TURN ou uma VPN mesh?
- Electron é suficiente ou será necessário migrar o pipeline crítico para código nativo?

## 2. Decisão de conectividade da V0

A V0 será **direct-only**:

- Sem Tailscale.
- Sem Radmin VPN.
- Sem ZeroTier.
- Sem Cloudflare Worker.
- Sem TURN.
- Sem VPS.
- Sem backend.
- Sem conta de usuário.
- Sem banco de dados.
- Sem servidor de sinalização.

A mídia deverá trafegar diretamente:

```text
PC A  <========== WebRTC DTLS-SRTP ==========>  PC B
```

O primeiro teste obrigatório será realizado em uma LAN física, onde os computadores conseguem alcançar os endereços locais um do outro.

Um teste posterior pela internet poderá habilitar **somente STUN público**, sem TURN, por configuração experimental. STUN apenas descobre o endereço público; ele não transporta tela ou áudio. Esse teste não faz parte do critério mínimo da primeira entrega.

## 3. Limitações aceitas

Sem TURN ou uma VPN mesh, a V0 não promete funcionar entre quaisquer duas redes pela internet.

A conexão poderá falhar quando houver:

- CGNAT;
- NAT simétrico;
- UDP bloqueado;
- firewall corporativo;
- roteador sem mapeamento utilizável;
- ausência de IPv6 direto;
- regras locais impedindo comunicação entre os computadores.

Uma falha desse tipo será considerada um resultado válido do experimento. A V0 deverá diagnosticar a causa provável em vez de esconder o problema.

## 4. Escopo funcional

### Incluído

- Windows 11 x64.
- Dois computadores.
- Um apresentador e um espectador por sessão.
- Captura de um monitor por vez.
- Áudio do sistema opcional.
- Presets 720p30, 1080p30 e 1080p60.
- Transmissão WebRTC direta.
- Criptografia DTLS-SRTP obrigatória.
- Player remoto com fullscreen, volume e encerramento.
- Estatísticas técnicas.
- Logs locais sem conteúdo ou segredos.
- Teste contínuo de até 12 horas.
- Instalador Windows por usuário com atalhos no menu Iniciar e na Área de Trabalho.
- Atualização automática opcional quando um feed Squirrel HTTPS for configurado no build.

### Fora da V0

- Compartilhamento simultâneo nos dois sentidos.
- Captura de janelas individuais.
- Microfone.
- Proteção contra screenshots.
- Código curto global.
- Chamada com nome de usuário.
- Bandeja do Windows.
- Reconexão completa após mudança de rede.
- Instalador assinado de produção.
- Cloudflare, Tailscale, Radmin ou ZeroTier.
- TURN ou relay próprio.
- Chat, arquivos, gravação ou controle remoto.

Esses itens permanecem requisitos potenciais do produto final, mas não devem impedir a validação do núcleo.

## 5. Stack da V0

### Aplicação

- Electron estável e fixado por versão.
- TypeScript com modo estrito.
- React para a interface.
- Vite para build do renderer.
- Electron Forge para empacotamento de teste.

### Mídia

- `desktopCapturer` para enumerar e capturar monitores.
- `RTCPeerConnection` do Chromium para vídeo, áudio, sincronização, congestionamento e criptografia.
- Captura de áudio `loopback` do Electron no Windows.
- Negociação nativa de codec do Chromium, sem codec proprietário.
- `contentHint = "detail"` para 720p30 e 1080p30.
- `contentHint = "motion"` para 1080p60.

Não serão integrados diretamente NVENC, AMF ou QSV na V0. O experimento deverá registrar se o Chromium utilizou codificação e decodificação aceleradas. Uma integração nativa só será considerada se a medição mostrar necessidade.

### Segurança do Electron

- Renderer com sandbox.
- `nodeIntegration: false`.
- `contextIsolation: true`.
- Interface privilegiada mínima via `contextBridge`.
- Conteúdo exclusivamente local.
- Content Security Policy restritiva.
- Sem `<webview>`.
- Navegação e criação de novas janelas bloqueadas.
- Validação de todo IPC.

Referências: [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security), [captura de desktop](https://www.electronjs.org/docs/latest/api/desktop-capturer/), [segurança do WebRTC](https://www.rfc-editor.org/rfc/rfc8827.html).

## 6. Pareamento sem servidor

A V0 usará sinalização manual por arquivos ou blocos copiáveis.

### Fluxo

1. O apresentador escolhe o monitor, qualidade e áudio.
2. O aplicativo cria uma oferta WebRTC sem TURN.
3. Depois da coleta de candidatos, gera um arquivo `convite.sfsinvite`.
4. O apresentador envia o arquivo pelo canal externo já usado pelo grupo, como Discord ou WhatsApp.
5. O espectador importa o convite.
6. O espectador gera `resposta.sfsanswer`.
7. O espectador devolve a resposta ao apresentador.
8. O apresentador importa a resposta.
9. Os dois aplicativos exibem um código de segurança de seis dígitos derivado das fingerprints DTLS e do transcript da sessão.
10. Os usuários comparam o código pelo canal externo.
11. O apresentador confirma e inicia a mídia.

### Conteúdo dos arquivos

Os arquivos devem possuir:

- versão do formato;
- identificador aleatório da sessão;
- timestamp de criação;
- expiração curta;
- descrição SDP;
- candidatos ICE coletados;
- fingerprint DTLS;
- nonce de sessão;
- checksum para detectar arquivo truncado.

Não devem possuir:

- chave privada;
- histórico do usuário;
- mídia;
- credencial persistente;
- segredo reutilizável.

Os arquivos expiram após 10 minutos e só podem ser usados uma vez. Na V0, o canal externo utilizado para transferi-los é considerado confiável. A comparação do código de segurança continua obrigatória para detectar alteração ou envio à pessoa errada.

## 7. Presets de qualidade

Os presets são limites máximos; o WebRTC pode reduzir bitrate, resolução ou FPS durante congestionamento.

| Preset | Resolução máxima | FPS máximo | Bitrate máximo inicial | Uso esperado |
|---|---:|---:|---:|---|
| Econômico | 1280×720 | 30 | 2,5 Mbps | Diagnóstico e redes fracas |
| Equilibrado | 1920×1080 | 30 | 5 Mbps | Texto, código e trabalho |
| Fluido | 1920×1080 | 60 | 10 Mbps | Movimento, jogos e rolagem |

Áudio do sistema:

- Opus negociado pelo WebRTC.
- 48 kHz.
- Estéreo quando suportado.
- Sem microfone.

Como existe apenas um transmissor na V0, não há risco de o áudio remoto ser recapturado em um fluxo de retorno. O produto bidirecional futuro deverá usar Application Loopback Capture excluindo a árvore de processos do SFScreen.

## 8. Interface mínima

### Tela inicial

```text
SFScreen V0

[ Criar compartilhamento ]
[ Importar convite ]
[ Importar resposta ]
```

### Criar compartilhamento

- Miniaturas dos monitores.
- Preset de qualidade.
- Áudio do sistema ligado/desligado.
- Botão para gerar convite.
- Estado da coleta ICE.

### Espectador

- Importar convite.
- Gerar resposta.
- Código de segurança.
- Player remoto.
- Fullscreen, volume, mute e desconectar.

### Estatísticas

- resolução enviada e recebida;
- FPS capturado, enviado, recebido e renderizado;
- codec negociado;
- bitrate atual;
- RTT;
- jitter;
- perda de pacotes;
- frames descartados;
- candidato ICE selecionado;
- tipo de candidato: `host`, `srflx` ou `relay`;
- protocolo e endereço da rota selecionada;
- motivo do encerramento;
- uso aproximado de CPU, memória e GPU quando disponível.

## 9. Arquitetura preparada para evolução

O mecanismo de mídia não poderá conhecer Cloudflare, Tailscale ou Radmin diretamente.

### Abstrações

```text
MediaEngine
  ├── CaptureSource
  ├── QualityProfile
  ├── PeerSession
  └── SessionStats

SignalingStrategy
  ├── ManualFileSignaling       # V0
  └── RemoteCodeSignaling       # futuro

ConnectivityStrategy
  ├── DirectHostCandidates      # V0 LAN
  ├── DirectWithStun            # experimento posterior
  ├── TurnFallback              # Cloudflare futuro
  └── OverlayInterface          # Tailscale/Radmin/ZeroTier futuro
```

Adicionar uma estratégia futura não deve alterar captura, player ou controles da sessão.

## 10. Fases de implementação

### Fase 0 — diagnóstico local

- Inicializar Electron com configuração segura.
- Enumerar monitores.
- Mostrar preview local.
- Registrar resolução e FPS reais.
- Validar captura contínua por 30 minutos.

### Fase 1 — loopback WebRTC no mesmo computador

- Criar dois peers dentro do ambiente de teste.
- Trocar offer/answer em memória.
- Enviar vídeo e áudio.
- Exibir estatísticas.
- Confirmar criptografia e codec negociado.

### Fase 2 — sinalização manual

- Implementar `.sfsinvite` e `.sfsanswer`.
- Validar versão, expiração, tamanho e checksum.
- Exibir fingerprints e código de segurança.
- Rejeitar reuso e arquivos inválidos.

### Fase 3 — dois computadores na mesma LAN

- Conectar dois PCs Windows 11.
- Testar os três presets.
- Testar perda de rede, encerramento e troca de monitor.
- Confirmar que nenhum pacote de mídia passa por servidor externo.

### Fase 4 — áudio e sincronização

- Testar vídeos, jogos e áudio contínuo.
- Medir drift depois de 30 minutos, 2 horas e 12 horas.
- Verificar mute, volume e encerramento limpo.

### Fase 5 — estabilidade prolongada

- Executar sessão 1080p60 por 12 horas.
- Monitorar memória, CPU, GPU, bitrate e frames descartados.
- Confirmar ausência de crescimento contínuo de memória.
- Exportar relatório técnico local ao encerrar.

### Fase 6 — experimento de internet direta

Somente depois da LAN estar estável:

- habilitar STUN público em uma configuração experimental;
- manter `iceTransportPolicy` sem relay;
- testar cada dupla de redes usada pelo grupo;
- registrar sucesso direto ou motivo de falha;
- não adicionar TURN nesta fase.

## 11. Testes obrigatórios

### Funcionais

- Monitor único e múltiplos monitores.
- 720p30, 1080p30 e 1080p60.
- Áudio ligado e desligado.
- Fullscreen, volume, mute e encerramento.
- Monitor desconectado durante a sessão.
- Convite expirado, reutilizado, corrompido ou de versão incompatível.

### Rede

- LAN cabeada.
- LAN Wi-Fi.
- IPv4 local.
- IPv6 quando disponível.
- Firewall bloqueando a aplicação.
- Interrupção de rede de 5, 15 e 60 segundos.
- Perda e limitação de banda simuladas.

### Segurança

- Mídia sempre em DTLS-SRTP.
- Nenhum modo sem criptografia.
- Fingerprints diferentes produzem código de segurança diferente.
- SDP e candidatos nunca aparecem nos logs normais.
- Nenhuma chave privada é exportada.
- Renderer não acessa Node.js ou APIs arbitrárias do sistema.

### Desempenho

- Tempo para primeiro frame.
- Latência aproximada captura→display.
- FPS sustentado.
- Uso de CPU e GPU.
- Frames perdidos e descartados.
- Drift audiovisual.
- Memória após 30 minutos, 2 horas e 12 horas.

## 12. Critérios de aceite da V0

A V0 estará concluída quando:

1. Dois PCs Windows 11 na mesma LAN trocarem convite e resposta sem servidor.
2. O espectador receber tela e áudio criptografados.
3. 1080p30 funcionar de maneira estável por duas horas.
4. 1080p60 funcionar quando hardware e rede permitirem.
5. O código de segurança coincidir nos dois computadores.
6. Encerrar a sessão liberar captura, áudio, peer connection e arquivos temporários.
7. Os logs não contiverem SDP, ICE, fingerprints completas, chaves ou conteúdo.
8. Uma sessão de 12 horas produzir um relatório sem vazamento progressivo de memória ou drift audiovisual perceptível.

1080p60 por 12 horas é uma meta de validação, não um bloqueio para considerar o núcleo funcional. Caso falhe, o relatório deverá distinguir gargalo de captura, encode, rede, decode ou renderização.

## 13. Decisão após a V0

Os resultados reais determinarão a próxima estratégia.

### Permanecer direct-only

Escolher se todas as duplas importantes conseguirem conexão direta e aceitarem o pareamento manual ou uma futura sinalização pequena.

### Adicionar Cloudflare

Escolher se:

- o grupo quiser código curto e conexão sem instalar VPN;
- algumas redes precisarem de TURN;
- a franquia de relay for suficiente ou o custo for aceitável.

Cloudflare adicionaria sinalização por código, STUN e TURN como fallback. A mídia continuaria WebRTC e ponta a ponta.

### Adicionar Tailscale

Escolher se:

- todos aceitarem instalar e autenticar o Tailscale;
- sessões longas tornarem a franquia TURN inadequada;
- for possível usar uma tailnet isolada ou `Share device` com acesso somente à porta do SFScreen.

### Adicionar Radmin VPN

Escolher se:

- o grupo preferir rede por nome e senha sem contas individuais;
- todos usarem Windows;
- aceitarem instalar o Radmin;
- o Firewall do Windows puder limitar rigorosamente a interface Radmin à porta do SFScreen.

O aplicativo nunca deverá recomendar `Allow All`, marcar toda a VPN como confiável ou desativar o firewall.

## 14. Princípios que não mudam

Independentemente da conectividade futura:

- Tela e áudio permanecem criptografados ponta a ponta.
- Nenhum relay recebe chaves de mídia.
- Nenhum algoritmo criptográfico próprio é inventado.
- A infraestrutura não entra no pipeline de captura ou renderização.
- Nenhuma opção ganha acesso automático à LAN.
- O usuário sempre controla quando a captura começa e termina.
- O produto final não terá chat, gravação, arquivos ou controle remoto.
- Segurança e estabilidade têm prioridade sobre quantidade de recursos.

