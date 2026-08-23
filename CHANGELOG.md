# Changelog

## 0.1.5 — 2026-08-23

- Ativa o updater pelo serviço público oficial do Electron e pelas GitHub Releases.
- Adiciona `npm run release -- patch|minor|major|X.Y.Z` para validar, versionar, taguear e publicar automaticamente.
- Mantém suporte a um feed HTTPS alternativo por variável de ambiente.

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
- Esta versão foi gerada antes da ativação do feed público; instale a 0.1.5 ou superior para receber updates automáticos.
