# Publicar o N2 no GitHub

Este guia transforma o projeto local em um app publicamente baixável.

## 1. Criar o repositório

No GitHub, crie um repositório vazio chamado `n2` (público ou privado). Não
adicione README nem `.gitignore` — o projeto já tem os dois.

No computador:

```bash
git init
git add .
git commit -m "feat: N2 v0.2.0"
git branch -M main
git remote add origin https://github.com/silvanoduarte094-crypto/n2.git
git push -u origin main
```

> Alternativa sem terminal: use **Add file → Upload files** no GitHub e envie o
> conteúdo da pasta (sem `node_modules`, `dist`, `server/dist`, `.tools` e
> `release`).

## 2. Habilitar GitHub Pages

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Pronto. O workflow `pages.yml` roda a cada push na `main` e publica a
   interface em:

```
https://silvanoduarte094-crypto.github.io/n2/
```

A versão do Pages roda **direto no navegador** com OpenAI, Anthropic, Gemini e
Ollama (CORS). Para GitHub Models ou APIs sem CORS, configure uma Proxy URL com
o bridge do Codespaces — veja `docs/WEB.md` — ou baixe o app completo.

## 3. Gerar o release com download

O workflow `release.yml` empacota o app portátil (Windows x64) com Node incluso.

Crie e envie uma tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Ao terminar, a release aparece em:

```
https://github.com/silvanoduarte094-crypto/n2/releases/latest
```

Arquivos gerados:

| Arquivo | Conteúdo |
| --- | --- |
| `n2-windows-x64.zip` | `node.exe`, `dist/`, `server/dist/server.cjs`, `start.bat`, `README.txt` |
| `n2-source.zip` | Código-fonte (sem builds e dependências) |

O usuário final baixa o zip, extrai e executa `start.bat`.

## 4. Testar o pacote localmente antes de publicar

```bash
npm run build:all
npm run package:win
```

Isso gera `release/n2-windows-x64.zip`. Extraia em uma pasta limpa, rode
`start.bat` e valide:

- [ ] O navegador abre em `http://127.0.0.1:7331`
- [ ] O onboarding aparece na primeira execução
- [ ] Uma mensagem responde com streaming
- [ ] O botão de ferramenta aparece em uma pergunta com cálculo
- [ ] Recarregar mantém a conversa
- [ ] `Configurações → Dados → Exportar` gera o JSON

## 5. Versionamento

- `package.json` → `version`
- `package-lock.json` → `version` (raiz e `packages[""]`)
- `server/index.ts` → `VERSION`
- `src/config.ts` → `APP_VERSION`
- `public/sw.js` → `CACHE` (force a atualização do PWA)
- `docs/RELEASE-NOTES.md` → notas da release (usadas pelo workflow)

Mantenha os três primeiros iguais e crie a tag com o mesmo número (`v0.2.0`).

## 6. Checklist de publicação

- [ ] `npm run typecheck` passando
- [ ] `npm run test:transport` passando
- [ ] `npm run build:all` passando
- [ ] README com o link do repositório correto (troque `silvanoduarte094-crypto`)
- [ ] Notas atualizadas em `docs/RELEASE-NOTES.md`
- [ ] Pages habilitado como GitHub Actions
- [ ] Tag enviada e release gerada
- [ ] `n2-windows-x64.zip` baixado e testado em pasta limpa
- [ ] Segredos fora do repositório (`git status` limpo)

## Solução de problemas

**O workflow de Release falha ao baixar o Node.**
Confira a versão no workflow `release.yml` em <https://nodejs.org/dist/> e ajuste.

**O app abre sem estilos ou com 404 nos assets.**
Verifique se `vite.config.ts` usa `base: './'` e se `dist/` foi copiado para o zip.

**Porta 7331 ocupada.**
Rode `set N2_PORT=7332` antes de `start.bat`, ou feche o processo que usa a porta.

**Chrome/Edge bloqueia a abertura automática do navegador.**
Abra manualmente `http://127.0.0.1:7331`.
