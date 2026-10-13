# Apura Brasil 26 — projeto para Vercel

Painel independente que consome **somente arquivos JSON oficiais do TSE**. O frontend não contém nomes, votos, percentuais, eleitorado ou números de seções fictícios. Se a fonte não responder, o endpoint não encontrar o arquivo ou o JSON não estiver identificado como oficial, a interface mostra um aviso e não exibe resultados.

## Fonte e formatos

- Portal: <https://resultados.tse.jus.br/oficial/app/index.html>
- Documentação técnica TSE 2026: <https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados>
- EA20: arquivos de resultados unificados (`-u.json`)
- EA12: configuração oficial de municípios (`mun-e00NNNN-cm.json`)
- URLs montadas com base nos códigos de eleição e nomenclatura documentados pelo TSE: primeiro turno federal `6257`; primeiro turno estadual `6259`; cargos `0001`, `0003`, `0005`, `0006`, `0007`, `0008`.

## Publicar na Vercel

1. Baixe e extraia este ZIP.
2. Crie um repositório no GitHub e envie **o conteúdo da pasta** para ele (não apenas o ZIP).
3. Entre em <https://vercel.com>, escolha **Add New → Project** e importe o repositório.
4. Framework preset: **Other**. Root Directory: `./`. Build Command: vazio. Output Directory: `public`. Install Command: `npm install`.
5. Clique em **Deploy**. As rotas `/api/results` e `/api/municipalities` são funções serverless da Vercel.
6. Após o deploy, abra a URL gerada e confira o status da fonte e o link do arquivo oficial consultado.

Alternativa pelo terminal, com Node.js 20+ e conta Vercel:

```bash
npm install
npx vercel login
npx vercel
npx vercel --prod
```

## Endpoints

- `GET /api/results?office=presidente&state=br`
- `GET /api/results?office=governador&state=pr`
- `GET /api/results?office=senador&state=sp`
- `GET /api/results?office=deputado-federal&state=pr&city=xxxxx`
- `GET /api/municipalities?state=pr&election=6259`

Cargos aceitos: `presidente`, `governador`, `senador`, `deputado-federal`, `deputado-estadual`, `deputado-distrital`. Para cargos estaduais, selecione uma UF. O código de município é obtido pela configuração EA12 do TSE; a UI não inventa códigos.

## Importante antes de usar publicamente

- A estrutura e a nomenclatura dos caminhos são baseadas na documentação técnica oficial TSE 2026. O endpoint público específico pode responder `404` antes da publicação do arquivo, e isso é tratado como indisponibilidade — nunca como zero votos.
- Não foi possível confirmar, nesta geração do projeto, uma resposta HTTP bem-sucedida do endpoint oficial de resultados pelo navegador de pesquisa. Por isso o projeto valida a resposta em tempo de execução e mostra erro explícito se a URL não estiver disponível. Antes de divulgar o site, faça o teste de fumaça abaixo após o TSE publicar os arquivos reais.
- O projeto consulta sob demanda e aplica cache curto para reduzir requisições. Evite encurtar o cache ou criar varreduras de todas as cidades; o TSE documenta limite de requisições por IP e possíveis bloqueios por muitos `404`.
- Este projeto não é afiliado ao TSE. Preserve a indicação da fonte oficial.
- A seleção de municípios funciona para cargos estaduais e depende da lista EA12 publicada para a eleição `6259`. Para Presidente, a interface consulta Brasil ou a UF selecionada; a lista municipal é desabilitada para evitar consulta desnecessária.
- O segundo turno não é ativado automaticamente nesta versão. Após o primeiro turno, a configuração deve ser atualizada para os códigos oficiais do segundo turno (`6258` federal e `6260` estadual) e para a regra de cargos que efetivamente disputam segundo turno. Não misture arquivos de turnos diferentes.

## Teste de fumaça

Depois do deploy, execute:

```bash
curl -i 'https://SEU-DOMINIO.vercel.app/api/results?office=presidente&state=br'
curl -i 'https://SEU-DOMINIO.vercel.app/api/municipalities?state=pr&election=6259'
```

A resposta deve ser JSON. Um `503`/`502` com mensagem clara significa que o arquivo ainda não está disponível ou a fonte não respondeu; não significa que o resultado seja zero.
