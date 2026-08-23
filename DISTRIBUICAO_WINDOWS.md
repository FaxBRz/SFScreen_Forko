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

O updater precisa de um endpoint HTTPS estático que sirva o arquivo `RELEASES` e os pacotes `.nupkg`. Embuta a URL base no build:

```powershell
$env:SFSCREEN_UPDATE_FEED_URL = 'https://updates.exemplo.com/sfscreen/windows/x64'
npm run make
```

A URL não pode conter usuário, senha, query string ou fragmento. Credenciais não devem ser compiladas no cliente.

Para publicar uma versão:

1. Atualize `version` no `package.json` e no lockfile, sem reutilizar uma versão já publicada.
2. Gere o instalador com a mesma URL de feed das versões anteriores.
3. Envie primeiro o novo `.nupkg` ao diretório HTTPS do feed.
4. Envie o novo `RELEASES` por último, evitando que clientes vejam um pacote ainda incompleto.
5. Disponibilize o novo `Setup.exe` e `SHA256SUMS.txt` na página de download.

O aplicativo verifica atualizações 15 segundos após abrir e novamente a cada quatro horas. Quando o download termina, oferece **Reiniciar agora**; se o usuário escolher **Depois**, o Squirrel aplica a versão ao fechar e abrir o app.

O repositório remoto atual é privado. O serviço público `update.electronjs.org` atende repositórios GitHub públicos; para este projeto, use armazenamento HTTPS estático ou um servidor de updates compatível com Squirrel. Os artefatos `RELEASES` e `.nupkg` gerados pelo `npm run make` já são o formato necessário.

## Assinatura de código

Sem assinatura, o instalador funciona, mas o Windows SmartScreen pode exibir um aviso de editor desconhecido. Para uma distribuição de produção, informe um certificado PFX sem colocar a senha no repositório:

```powershell
$env:SFSCREEN_CERTIFICATE_FILE = 'C:\segredos\sfscreen.pfx'
$env:SFSCREEN_CERTIFICATE_PASSWORD = '<senha>'
$env:SFSCREEN_UPDATE_FEED_URL = 'https://updates.exemplo.com/sfscreen/windows/x64'
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

