# Contribuindo com o N2

Obrigado pelo interesse! O N2 é MIT e aceita contribuições de código, documentação
e ideias.

## Antes de começar

- Use Node 24+ (veja `.nvmrc`).
- `npm install` e `npm run typecheck` devem passar.
- Erros de tipo bloqueiam o merge.

## Fluxo

1. Abra uma issue descrevendo o problema ou a proposta.
2. Crie um branch: `feat/minha-feature` ou `fix/meu-bug`.
3. Faça commits pequenos e descritivos (padrão [Conventional Commits](https://www.conventionalcommits.org/)).
4. Rode:

```bash
npm run typecheck
npm run build:all
npm test
```

5. Abra o pull request explicando o que mudou e como testar.

## Padrões de código

- TypeScript estrito; evite `any` sem justificativa.
- Componentes funcionais e hooks; estilos em `src/styles.css` seguindo as
  variáveis existentes.
- Textos de interface em português (pt-BR), curtos e diretos.
- Sem novas dependências sem discussão prévia (bundle e privacidade importam).
- Ferramentas novas entram em `src/lib/tools.ts` com schema e teste manual.
- Provedores novos seguem o contrato de `src/lib/providers/index.ts`.

## Testando localmente

```bash
npm run dev:all      # app + bridge
npm run mock         # LLM mock (:11434) + MYRKAVELL mock (:8788)
```

Roteiro mínimo de teste manual:

- Enviar mensagem e ver streaming.
- Pedir um cálculo e conferir o cartão da ferramenta.
- Chamar o conector MYRKAVELL contra o mock.
- Recarregar a página e confirmar que a conversa persistiu.
- Exportar e importar backup.

## Documentação

Mudanças de arquitetura, conector ou release devem atualizar os arquivos em
`docs/`. Mantenha o README alinhado ao comportamento real.

## Segurança

- Nunca inclua chaves, tokens ou dados pessoais em commits, issues ou exemplos.
- Siga o [SECURITY.md](SECURITY.md) para reportar vulnerabilidades.

## Licença

Ao contribuir, você concorda que sua contribuição será licenciada sob MIT.
