N2 - Nucleo de Inteligencia (portatil)
======================================

Como usar
---------
1. Extraia todos os arquivos deste zip em uma pasta (ex.: C:\N2).
2. Execute start.bat.
3. O navegador abre em http://127.0.0.1:7331

Nao e preciso instalar Node, Docker ou qualquer dependencia.
O pacote ja inclui o runtime Node portatil.

Primeiro acesso
---------------
- Escolha um provedor de IA no onboarding.
- GitHub Models (gratuito): crie um token em https://github.com/settings/tokens
  com permissao models:read.
- Ollama (local): instale o Ollama, rode "ollama serve" e baixe um modelo.
- As chaves ficam apenas no seu navegador (IndexedDB).

Dados e privacidade
-------------------
- Conversas, memorias e configuracoes ficam no IndexedDB deste navegador.
- Nenhuma telemetria.
- Para nao perder dados, use Configuracoes -> Dados -> Exportar.

Encerrar
--------
- Feche a janela do start.bat.

Problemas comuns
----------------
- Porta 7331 ocupada: execute no Prompt de Comando
    set N2_PORT=7332
    start.bat
- Navegador nao abriu: acesse http://127.0.0.1:7331 manualmente.
- Bridge remoto com token: defina N2_PROXY_TOKEN antes de iniciar e informe o
  mesmo token em Configuracoes -> Geral -> Token do proxy.

Licenca MIT. Codigo-fonte: https://github.com/silvanoduarte094-crypto/n2
