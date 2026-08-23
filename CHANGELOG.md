# Changelog

## 0.1.4 — 2026-08-23

Primeira pre-release distribuída com um instalador Windows completo.

### Destaques

- Instalador Squirrel para Windows 11 x64, com atalhos na Área de Trabalho e no menu Iniciar.
- Nova animação de instalação do SFScreen no lugar da tela verde genérica.
- Tratamento correto dos eventos internos do Squirrel, evitando que a janela do aplicativo pisque e feche durante a instalação.
- Atualizador automático preparado para um feed Squirrel HTTPS configurado no build.
- Pacotes `RELEASES` e `.nupkg` incluídos para futura publicação de updates.
- Build comprimido com ASAR, somente idiomas `pt-BR` e `en-US` e dependências de compilação removidas.
- Checksums SHA-256 para validar todos os arquivos publicados.

### Verificação

- 106 testes automatizados aprovados.
- Smoke test E2E aprovado no executável empacotado.
- Instalador com aproximadamente 128 MB.

### Avisos desta pre-release

- O instalador ainda não possui assinatura de código; o Windows pode exibir um aviso de editor desconhecido.
- Como o repositório é privado, o updater não usa diretamente o GitHub. Um feed HTTPS Squirrel separado ainda precisa ser configurado para updates automáticos.

