# Distribuição do SFScreen no Windows

## Gerar o instalador

No PowerShell, execute:

```powershell
npm install
npm run make
```

O comando gera, em `out/make/squirrel.windows/x64/`:

- `SFScreen-<versão>-Setup-x64.exe`: instalador por usuário, sem exigir administrador;
- `SFScreen-<versão>-full.nupkg`: pacote consumido pelo updater;
- `RELEASES`: índice do feed Squirrel;
- `SHA256SUMS.txt` e o `.sha256` do instalador: hashes para conferência do download.

O instalador cria atalhos na Área de Trabalho e no menu Iniciar. O `AppUserModelId` está alinhado ao identificador do Squirrel, então o usuário também pode clicar com o botão direito no atalho e escolher **Fixar em Iniciar** ou **Fixar na barra de tarefas**. Versões atuais do Windows não oferecem uma API suportada para um instalador fixar o aplicativo automaticamente sem escolha do usuário.

## Habilitar atualização automática

O build padrão usa o serviço público oficial `update.electronjs.org`, que consulta as releases do repositório público `FaxBRz/SFScreen_Forko`. Não há token dentro do aplicativo e não é necessário hospedar um site separado.

O updater reconhece somente releases que:

- tenham uma tag SemVer maior, como `v0.1.5`;
- estejam publicadas, sem serem draft ou pre-release;
- incluam o instalador, `RELEASES` e o pacote `*-full.nupkg`.

Para usar outro servidor HTTPS no futuro, ainda é possível sobrescrever a URL durante o build:

```powershell
$env:SFSCREEN_UPDATE_FEED_URL = 'https://updates.exemplo.com/sfscreen/windows/x64'
npm run make
```

A URL alternativa não pode conter usuário, senha, query string ou fragmento. Credenciais não devem ser compiladas no cliente.

## Publicar uma versão automaticamente

Com o GitHub CLI autenticado e a árvore de trabalho limpa, execute no Windows:

```powershell
npm run release -- patch
```

Também são aceitos `minor`, `major` ou uma versão explícita, como `npm run release -- 0.2.0`.

O script executa typecheck, lint, testes unitários, build do instalador e smoke test E2E. Depois atualiza a versão, cria commit e tag, envia ambos de forma atômica e publica uma GitHub Release estável com todos os artefatos. Se uma validação falhar antes do commit, restaura os arquivos de versão.

O aplicativo verifica atualizações 15 segundos após abrir e novamente a cada quatro horas. Quando o download termina, oferece **Reiniciar agora**; se o usuário escolher **Depois**, o Squirrel aplica a versão ao fechar e abrir o app.

Não volte o repositório para privado enquanto este canal de update estiver em uso. Releases privadas exigiriam autenticação no cliente e não devem receber um token pessoal embutido.

## Assinatura de código

Sem assinatura, o instalador funciona, mas o Windows SmartScreen pode exibir um aviso de editor desconhecido. Para uma distribuição de produção, informe um certificado PFX sem colocar a senha no repositório:

```powershell
$env:SFSCREEN_CERTIFICATE_FILE = 'C:\segredos\sfscreen.pfx'
$env:SFSCREEN_CERTIFICATE_PASSWORD = '<senha>'
npm run make
```

Mantenha o mesmo editor, `name`, nome do executável e `AppUserModelId` entre versões. Trocar essas identidades pode quebrar atalhos e atualização.

## Tamanho do pacote

O build aplica ASAR, mantém somente os idiomas `pt-BR` e `en-US`, remove dependências usadas apenas na compilação e não gera o MSI redundante. O `Setup.exe`/`.nupkg` é comprimido pelo Squirrel. A pasta instalada ainda contém o Chromium e o runtime Electron, portanto seu tamanho em disco será maior que o download e não pode ser reduzido a poucos megabytes sem trocar a tecnologia da aplicação.

## Verificação manual recomendada

1. Instale uma versão antiga com o `Setup.exe` em uma conta Windows de teste.
2. Confirme os atalhos da Área de Trabalho e do menu Iniciar.
3. Publique uma versão maior no feed e abra a versão antiga.
4. Aguarde o aviso, escolha **Reiniciar agora** e confirme a nova versão instalada.
5. Desinstale em **Aplicativos instalados** e confirme que os atalhos foram removidos.
